/**
 * SuggestionCard - Card singolo suggerimento con azioni
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  MessageSquare, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  FileText,
  Truck,
  Loader2,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import type { StudioSuggestion, PendingReason } from '@shared/studio-assistant-types';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';

interface SuggestionCardProps {
  suggestion: StudioSuggestion;
  onMarkAsDone: (suggestionId: string, jobId?: string) => Promise<void>;
  onDismiss: (suggestionId: string) => Promise<void>;
  onMarkAsNeedsWork: (jobId: string, reason: PendingReason) => Promise<void>;
  onMarkAsDelivered: (jobId: string) => Promise<void>;
  onBookConsultation?: (templateId: string, jobId: string, dates?: { from: string; to: string }) => void;
}

const priorityColors = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-green-100 text-green-800 border-green-200'
};

const priorityLabels = {
  high: 'Urgente',
  medium: 'Medio',
  low: 'Normale'
};

const pendingReasonLabels: Record<PendingReason, string> = {
  editing: '⏳ In lavorazione',
  client_waiting: '📸 In attesa selezione cliente',
  printing: '🖨️ In stampa',
  other: '❓ Altro'
};

export default function SuggestionCard({
  suggestion,
  onMarkAsDone,
  onDismiss,
  onMarkAsNeedsWork,
  onMarkAsDelivered,
  onBookConsultation
}: SuggestionCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [showReasonDialog, setShowReasonDialog] = useState(false);
  
  const handleAction = async (action: () => Promise<void>) => {
    setIsLoading(true);
    setIsExiting(true);
    try {
      await action();
    } catch {
      setIsExiting(false);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleWhatsApp = () => {
    if (suggestion.clientPhone && suggestion.whatsappMessage) {
      const formattedPhone = formatPhoneForWhatsApp(suggestion.clientPhone);
      const encodedMessage = encodeURIComponent(suggestion.whatsappMessage);
      window.open(`https://wa.me/${formattedPhone}?text=${encodedMessage}`, '_blank');
      handleAction(() => onMarkAsDone(suggestion.id, suggestion.jobId));
    }
  };
  
  const handleBookConsultation = () => {
    if (suggestion.consultationTemplateId && suggestion.jobId && onBookConsultation) {
      onBookConsultation(
        suggestion.consultationTemplateId,
        suggestion.jobId,
        suggestion.suggestedDates
      );
    }
  };
  
  const getIcon = () => {
    switch (suggestion.type) {
      case 'unsigned_quote':
        return <FileText className="h-5 w-5 text-amber-600" />;
      case 'pending_delivery':
        return <Truck className="h-5 w-5 text-blue-600" />;
      case 'consultation':
        return <Calendar className="h-5 w-5 text-sage" />;
      case 'pending_order':
        return <AlertCircle className="h-5 w-5 text-orange-600" />;
      case 'pending_booking':
        return <Calendar className="h-5 w-5 text-purple-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-600" />;
    }
  };
  
  const getTitle = () => {
    switch (suggestion.type) {
      case 'unsigned_quote':
        return 'Preventivo non firmato';
      case 'pending_delivery':
        return 'Lavoro da consegnare';
      case 'consultation':
        return 'Consulenza suggerita';
      case 'pending_order':
        return suggestion.isWalkIn ? 'Ordine Walk-in' : 'Ordine da completare';
      case 'pending_booking':
        return 'Booking da completare';
      default:
        return 'Suggerimento';
    }
  };

  return (
    <>
      <Card 
        className={`border-l-4 hover:shadow-md transition-all duration-300 ${
          isExiting 
            ? 'opacity-0 scale-95 -translate-x-4' 
            : 'opacity-100 scale-100 translate-x-0'
        }`} 
        style={{
          borderLeftColor: suggestion.priority === 'high' ? '#ef4444' : 
                           suggestion.priority === 'medium' ? '#f59e0b' : '#22c55e'
        }}>
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col gap-3">
            {/* Icon e Info */}
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="flex-shrink-0 p-1.5 sm:p-2 bg-gray-50 rounded-lg">
                {getIcon()}
              </div>
              
              <div className="flex-1 min-w-0 overflow-hidden">
                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className={`${priorityColors[suggestion.priority]} text-xs px-1.5 py-0.5`}>
                    {priorityLabels[suggestion.priority]}
                  </Badge>
                  <span className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {getTitle()}
                  </span>
                </div>
                
                <h4 className="text-sm sm:text-base font-bold text-gray-900 leading-tight break-words">
                  {suggestion.clientName || suggestion.jobName || 'Suggerimento'}
                </h4>
                
                {suggestion.jobName && suggestion.clientName && (
                  <p className="text-xs sm:text-sm text-gray-600 break-words">
                    {suggestion.jobName}
                  </p>
                )}

                {suggestion.orderTotal !== undefined && (
                  <p className="text-xs sm:text-sm font-semibold text-green-700 mt-1">
                    Totale: €{suggestion.orderTotal.toFixed(2)}
                  </p>
                )}
                
                {suggestion.reason && (
                  <p className="text-xs sm:text-sm text-gray-500 mt-1 line-clamp-2">
                    {suggestion.reason}
                  </p>
                )}
                
                {suggestion.suggestedDates && (
                  <p className="text-[10px] sm:text-xs text-sage mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3 flex-shrink-0" />
                    <span className="break-words">Date: {suggestion.suggestedDates.from} - {suggestion.suggestedDates.to}</span>
                  </p>
                )}
              </div>
            </div>
            
            {/* Azioni */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-2 border-t border-gray-100">
              {/* Azioni per ordini non completati */}
              {suggestion.type === 'pending_order' && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => window.open(`/admin/ordini/${suggestion.orderId}`, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    <span className="hidden xs:inline">Apri </span>Ordine
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => handleAction(() => onDismiss(suggestion.id))}
                    disabled={isLoading}
                  >
                    <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    Ignora
                  </Button>
                </>
              )}

              {/* Azioni per booking da completare */}
              {suggestion.type === 'pending_booking' && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => window.open(`/admin/calendario`, '_blank')}
                  >
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    Calendario
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => handleAction(() => onDismiss(suggestion.id))}
                    disabled={isLoading}
                  >
                    <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    Ignora
                  </Button>
                </>
              )}

              {/* Azioni per preventivo non firmato */}
              {suggestion.type === 'unsigned_quote' && (
                <>
                  <Button 
                    size="sm" 
                    onClick={handleWhatsApp}
                    disabled={isLoading || !suggestion.clientPhone}
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3 bg-green-600 hover:bg-green-700"
                  >
                    <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    WhatsApp
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => handleAction(() => onDismiss(suggestion.id))}
                    disabled={isLoading}
                  >
                    <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    Ignora
                  </Button>
                </>
              )}
              
              {/* Azioni per lavoro da consegnare */}
              {suggestion.type === 'pending_delivery' && (
                <>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => window.open(`/admin/jobs/${suggestion.jobId}`, '_blank')}
                  >
                    <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    Dettagli
                  </Button>
                  <Button 
                    size="sm"
                    onClick={() => handleAction(() => onMarkAsDelivered(suggestion.jobId!))}
                    disabled={isLoading}
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3 bg-sage hover:bg-sage/90"
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    )}
                    <span className="hidden xs:inline">Sì, </span>Consegnato
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                    onClick={() => setShowReasonDialog(true)}
                    disabled={isLoading}
                  >
                    <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    No
                  </Button>
                </>
              )}
              
              {/* Azioni per consulenza */}
              {suggestion.type === 'consultation' && (
                <>
                  <Button 
                    size="sm"
                    onClick={handleBookConsultation}
                    disabled={isLoading}
                    className="h-8 text-xs sm:text-sm px-2 sm:px-3 bg-sage hover:bg-sage/90"
                  >
                    <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                    Prenota
                  </Button>
                  {suggestion.clientPhone && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      className="h-8 text-xs sm:text-sm px-2 sm:px-3"
                      onClick={handleWhatsApp}
                      disabled={isLoading}
                    >
                      <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1" />
                      Invita
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Dialog motivo non consegnato */}
      <AlertDialog open={showReasonDialog} onOpenChange={setShowReasonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perché non è ancora consegnato?</AlertDialogTitle>
            <AlertDialogDescription>
              Seleziona il motivo per organizzare meglio i tuoi lavori.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="grid grid-cols-1 gap-2 py-4">
            {(Object.entries(pendingReasonLabels) as [PendingReason, string][]).map(([reason, label]) => (
              <Button
                key={reason}
                variant="outline"
                className="justify-start h-auto py-3 px-4"
                onClick={() => {
                  handleAction(() => onMarkAsNeedsWork(suggestion.jobId!, reason));
                  setShowReasonDialog(false);
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

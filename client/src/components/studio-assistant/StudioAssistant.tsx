/**
 * StudioAssistant - Componente principale sistema suggerimenti
 * Modalità: full (dashboard), compact (widget), job-specific
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Sparkles, 
  FileText, 
  Truck, 
  Calendar, 
  Clock,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import { useStudioSuggestions } from './useStudioSuggestions';
import SuggestionCard from './SuggestionCard';
import WorkPendingList from './WorkPendingList';
import type { PendingReason } from '@shared/studio-assistant-types';

interface StudioAssistantProps {
  mode?: 'full' | 'compact' | 'job-specific';
  jobId?: string;
  showHeader?: boolean;
  className?: string;
}

export default function StudioAssistant({ 
  mode = 'full', 
  jobId,
  showHeader = true,
  className = ''
}: StudioAssistantProps) {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState('all');
  
  const {
    unsignedQuotes,
    pendingDeliveries,
    consultations,
    needsWorkJobs,
    loading,
    error,
    stats,
    markAsDone,
    dismiss,
    markAsNeedsWork,
    markAsDelivered,
    refetch
  } = useStudioSuggestions({ mode, jobId });
  
  const handleBookConsultation = (
    templateId: string, 
    jobId: string, 
    dates?: { from: string; to: string }
  ) => {
    let url = `/admin/consulenze/nuovo?templateId=${templateId}&jobId=${jobId}`;
    if (dates) {
      url += `&dateFrom=${dates.from}&dateTo=${dates.to}`;
    }
    navigate(url);
  };
  
  const totalSuggestions = unsignedQuotes.length + pendingDeliveries.length + consultations.length;
  
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card className={`border-red-200 ${className}`}>
        <CardContent className="py-8 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <p className="text-red-600">Errore caricamento suggerimenti</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4">
            <RefreshCw className="h-4 w-4 mr-2" />
            Riprova
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  // Modalità compact: mostra solo riepilogo e top 3 urgenti
  if (mode === 'compact') {
    const urgentSuggestions = [
      ...unsignedQuotes.filter(s => s.priority === 'high'),
      ...pendingDeliveries.filter(s => s.priority === 'high'),
      ...consultations.filter(s => s.priority === 'high')
    ].slice(0, 3);
    
    if (totalSuggestions === 0) {
      return (
        <Card className={`bg-gradient-to-br from-sage/5 to-white ${className}`}>
          <CardContent className="py-6 text-center">
            <CheckCircle2 className="h-10 w-10 text-sage mx-auto mb-3" />
            <p className="text-sage font-medium">Tutto in ordine!</p>
            <p className="text-sm text-gray-500">Nessuna azione urgente richiesta</p>
          </CardContent>
        </Card>
      );
    }
    
    return (
      <Card className={`bg-gradient-to-br from-amber-50 to-white ${className}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Azioni Consigliate
            </CardTitle>
            <Badge variant="secondary" className="bg-amber-100 text-amber-800">
              {totalSuggestions}
            </Badge>
          </div>
          {stats.estimatedMinutes > 0 && (
            <CardDescription className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              ~{stats.estimatedMinutes} min
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {urgentSuggestions.map(suggestion => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              onMarkAsDone={markAsDone}
              onDismiss={dismiss}
              onMarkAsNeedsWork={markAsNeedsWork}
              onMarkAsDelivered={markAsDelivered}
              onBookConsultation={handleBookConsultation}
            />
          ))}
          
          {totalSuggestions > 3 && (
            <Button 
              variant="ghost" 
              className="w-full text-amber-700"
              onClick={() => navigate('/admin/dashboard?tab=assistente')}
            >
              Vedi tutti ({totalSuggestions})
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }
  
  // Modalità full: tabs con tutte le sezioni
  return (
    <Card className={className}>
      {showHeader && (
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-sage" />
                Assistente Studio
              </CardTitle>
              <CardDescription>
                {totalSuggestions > 0 ? (
                  <>
                    {stats.totalActions} azioni consigliate 
                    {stats.estimatedMinutes > 0 && ` (~${stats.estimatedMinutes} min)`}
                  </>
                ) : (
                  'Tutto in ordine!'
                )}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
      )}
      
      <CardContent>
        {totalSuggestions === 0 && needsWorkJobs.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="h-16 w-16 text-sage mx-auto mb-4" />
            <p className="text-xl font-medium text-sage mb-2">Ottimo lavoro!</p>
            <p className="text-gray-500">Nessuna azione richiesta al momento</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 mb-4">
              <TabsTrigger value="all" className="text-xs sm:text-sm">
                Tutti
                {totalSuggestions > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {totalSuggestions}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="quotes" className="text-xs sm:text-sm">
                <FileText className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Preventivi</span>
                {unsignedQuotes.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {unsignedQuotes.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="delivery" className="text-xs sm:text-sm">
                <Truck className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Consegne</span>
                {pendingDeliveries.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {pendingDeliveries.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="work" className="text-xs sm:text-sm">
                <Clock className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Da fare</span>
                {needsWorkJobs.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {needsWorkJobs.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="space-y-3 mt-0">
              {[...unsignedQuotes, ...pendingDeliveries, ...consultations]
                .sort((a, b) => {
                  const priorityOrder = { high: 0, medium: 1, low: 2 };
                  return priorityOrder[a.priority] - priorityOrder[b.priority];
                })
                .map(suggestion => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onMarkAsDone={markAsDone}
                    onDismiss={dismiss}
                    onMarkAsNeedsWork={markAsNeedsWork}
                    onMarkAsDelivered={markAsDelivered}
                    onBookConsultation={handleBookConsultation}
                  />
                ))}
            </TabsContent>
            
            <TabsContent value="quotes" className="space-y-3 mt-0">
              {unsignedQuotes.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  Nessun preventivo in attesa di firma
                </p>
              ) : (
                unsignedQuotes.map(suggestion => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onMarkAsDone={markAsDone}
                    onDismiss={dismiss}
                    onMarkAsNeedsWork={markAsNeedsWork}
                    onMarkAsDelivered={markAsDelivered}
                    onBookConsultation={handleBookConsultation}
                  />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="delivery" className="space-y-3 mt-0">
              {pendingDeliveries.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  Nessun lavoro in attesa di consegna
                </p>
              ) : (
                pendingDeliveries.map(suggestion => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onMarkAsDone={markAsDone}
                    onDismiss={dismiss}
                    onMarkAsNeedsWork={markAsNeedsWork}
                    onMarkAsDelivered={markAsDelivered}
                    onBookConsultation={handleBookConsultation}
                  />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="work" className="mt-0">
              <WorkPendingList 
                jobs={needsWorkJobs}
                onMarkAsDelivered={markAsDelivered}
                onBookConsultation={handleBookConsultation}
              />
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}

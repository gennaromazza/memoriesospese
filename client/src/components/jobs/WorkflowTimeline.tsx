import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Job, JobTimelineEvent } from '@shared/jobs-types';
import { DEFAULT_WORKFLOW_STEPS, WorkflowStep } from '@shared/job-workflow-types';
import { ConsultationTemplate } from '@shared/consultation-types';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { 
  CalendarPlus, 
  CalendarCheck, 
  FileText, 
  CheckCircle, 
  Calendar, 
  Image, 
  Eye, 
  CheckCircle2,
  LucideIcon,
  Send,
  MessageCircle,
  Mail,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface WorkflowTimelineProps {
  job: Job;
  workflowSteps?: WorkflowStep[];
  onToggleStep?: (stepId: string, completed: boolean) => void;
  onRequestCreateAppointment?: (job: Job) => void;
  onEventAdded?: () => void;
  isAdmin?: boolean;
}

const ICON_MAP: Record<string, LucideIcon> = {
  'calendar-plus': CalendarPlus,
  'calendar-check': CalendarCheck,
  'file-text': FileText,
  'check-circle': CheckCircle,
  'calendar': Calendar,
  'image': Image,
  'eye': Eye,
  'check-circle-2': CheckCircle2,
};

export default function WorkflowTimeline({ 
  job, 
  workflowSteps,
  onToggleStep,
  onRequestCreateAppointment,
  onEventAdded,
  isAdmin = false 
}: WorkflowTimelineProps) {
  const { toast } = useToast();
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showConsultationDialog, setShowConsultationDialog] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sendingConsultation, setSendingConsultation] = useState(false);

  // Fetch consultation templates per questo jobType
  const { data: templates = [], isLoading: loadingTemplates } = useQuery<ConsultationTemplate[]>({
    queryKey: ['/api/consultation-templates', job.jobType],
    enabled: showTemplateSelector && !!job.jobType,
  });

  const steps = workflowSteps || DEFAULT_WORKFLOW_STEPS.map(config => ({
    id: config.id,
    label: config.label,
    order: config.order,
    icon: config.icon,
    completedAt: undefined,
    completedBy: undefined
  }));

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  
  // Eventi workflow dinamici (consulenze inviate, appuntamenti creati)
  const workflowEvents = (job.workflowEvents || []).sort((a, b) => {
    const dateA = a.data?.toDate ? a.data.toDate() : new Date(a.data as any);
    const dateB = b.data?.toDate ? b.data.toDate() : new Date(b.data as any);
    return dateB.getTime() - dateA.getTime();
  });

  const handleToggle = (stepId: string, currentlyCompleted: boolean) => {
    if (onToggleStep && isAdmin) {
      onToggleStep(stepId, !currentlyCompleted);
    }
  };

  const handleOpenTemplateSelector = () => {
    setShowTemplateSelector(true);
    setSelectedTemplateId(null);
  };

  const handleSelectTemplate = () => {
    if (!selectedTemplateId) {
      toast({
        title: 'Selezione mancante',
        description: 'Seleziona un template consulenza',
        variant: 'destructive',
      });
      return;
    }
    setShowTemplateSelector(false);
    setShowConsultationDialog(true);
  };

  const handleSendConsultation = async (channel: 'email' | 'whatsapp') => {
    if (!selectedTemplateId) {
      toast({
        title: 'Errore',
        description: 'Template consulenza non selezionato',
        variant: 'destructive',
      });
      return;
    }

    setSendingConsultation(true);
    try {
      const response = await apiRequest('POST', `/api/jobs/${job.id}/send-consultation-request`, {
        channel,
        templateId: selectedTemplateId
      });
      const data = await response.json();
      
      if (channel === 'whatsapp' && data.whatsappLink) {
        // Apri WhatsApp in nuova finestra
        window.open(data.whatsappLink, '_blank');
      }
      
      toast({
        title: 'Richiesta inviata',
        description: channel === 'email' 
          ? 'Email di richiesta consulenza inviata al cliente'
          : 'Apri WhatsApp per inviare il messaggio',
      });
      
      setShowConsultationDialog(false);
      setSelectedTemplateId(null);
      onEventAdded?.();
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Impossibile inviare la richiesta',
        variant: 'destructive',
      });
    } finally {
      setSendingConsultation(false);
    }
  };

  const handleRequestAppointment = () => {
    if (onRequestCreateAppointment) {
      onRequestCreateAppointment(job);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Workflow Steps Checklist */}
        {sortedSteps.map((step, index) => {
          const Icon = step.icon ? ICON_MAP[step.icon] || CheckCircle : CheckCircle;
          const isCompleted = !!step.completedAt;
          const isLast = index === sortedSteps.length - 1;

          return (
            <div key={step.id} className="relative" data-testid={`workflow-step-${step.id}`}>
              {/* Connector Line */}
              {!isLast && (
                <div 
                  className={cn(
                    "absolute left-[15px] top-8 w-0.5 h-6 -ml-px",
                    isCompleted ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                  )}
                />
              )}

              {/* Step Content */}
              <div className="flex items-start gap-3">
                {/* Icon/Checkbox */}
                <div className="flex-shrink-0 mt-1">
                  {isAdmin ? (
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={() => handleToggle(step.id, isCompleted)}
                      className="h-5 w-5"
                      data-testid={`checkbox-step-${step.id}`}
                    />
                  ) : (
                    <div className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center",
                      isCompleted 
                        ? "bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400" 
                        : "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500"
                    )}>
                      <Icon className="h-4 w-4" />
                    </div>
                  )}
                </div>

                {/* Step Details */}
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-medium",
                    isCompleted 
                      ? "text-gray-900 dark:text-white" 
                      : "text-gray-500 dark:text-gray-400"
                  )}>
                    {step.label}
                  </p>
                  {step.completedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {format(step.completedAt.toDate(), 'dd/MM/yyyy', { locale: it })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Workflow Events (consulenze inviate, appuntamenti creati) */}
        {workflowEvents.length > 0 && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Attività Recenti</h4>
            <div className="space-y-2">
              {workflowEvents.slice(0, 5).map((event) => {
                const eventDate = event.data?.toDate ? event.data.toDate() : new Date(event.data as any);
                return (
                  <div key={event.id} className="flex items-start gap-2 text-sm">
                    <div className="flex-shrink-0 mt-0.5">
                      {event.tipo === 'consulenza_inviata' ? (
                        <Send className="h-4 w-4 text-blue-500" />
                      ) : event.tipo === 'appuntamento_creato' ? (
                        <CalendarPlus className="h-4 w-4 text-green-500" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-gray-900 dark:text-white">{event.descrizione}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(eventDate, 'dd/MM/yyyy HH:mm', { locale: it })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Buttons (Admin only) */}
        {isAdmin && (
          <div className="mt-6 pt-4 border-t space-y-2">
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">Azioni Rapide</h4>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleOpenTemplateSelector}
                data-testid="button-send-consultation"
              >
                <Eye className="h-4 w-4 mr-2" />
                Appuntamento Consulenza
              </Button>
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={handleRequestAppointment}
                data-testid="button-request-appointment"
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                Richiedi Appuntamento
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog 1: Selezione template consulenza */}
      <Dialog open={showTemplateSelector} onOpenChange={setShowTemplateSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Seleziona Tipo Consulenza</DialogTitle>
            <DialogDescription>
              Scegli quale consulenza inviare al cliente per {job.nomeEvento}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {loadingTemplates ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">Caricamento template...</div>
              </div>
            ) : templates.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-muted-foreground">
                  Nessun template consulenza disponibile per {job.jobType}
                </div>
              </div>
            ) : (
              <RadioGroup value={selectedTemplateId || ''} onValueChange={setSelectedTemplateId}>
                <div className="space-y-3">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className={cn(
                        "flex items-start space-x-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                        selectedTemplateId === template.id
                          ? "border-primary bg-primary/5"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                      onClick={() => setSelectedTemplateId(template.id)}
                    >
                      <RadioGroupItem value={template.id} id={template.id} />
                      <Label htmlFor={template.id} className="flex-1 cursor-pointer">
                        <div className="font-medium text-sm">{template.nome}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {template.descrizione}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {template.durataMinuti} minuti
                          </span>
                        </div>
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowTemplateSelector(false)}
            >
              Annulla
            </Button>
            <Button
              onClick={handleSelectTemplate}
              disabled={!selectedTemplateId || loadingTemplates}
              data-testid="button-confirm-template"
            >
              Continua
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Scelta canale invio consulenza */}
      <Dialog open={showConsultationDialog} onOpenChange={setShowConsultationDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invia Richiesta Consulenza</DialogTitle>
            <DialogDescription>
              Scegli come inviare la richiesta di appuntamento al cliente
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              onClick={() => handleSendConsultation('email')}
              disabled={sendingConsultation}
              data-testid="button-send-email"
            >
              <Mail className="h-5 w-5 mr-3" />
              <div className="text-left">
                <p className="font-medium">Invia via Email</p>
                <p className="text-xs text-muted-foreground">
                  Il cliente riceverà un'email con il link per prenotare
                </p>
              </div>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4"
              onClick={() => handleSendConsultation('whatsapp')}
              disabled={sendingConsultation}
              data-testid="button-send-whatsapp"
            >
              <MessageCircle className="h-5 w-5 mr-3" />
              <div className="text-left">
                <p className="font-medium">Invia via WhatsApp</p>
                <p className="text-xs text-muted-foreground">
                  Apri WhatsApp con messaggio pre-compilato
                </p>
              </div>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowConsultationDialog(false)}
              disabled={sendingConsultation}
            >
              Annulla
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * CONSULTATION VISIONE SECTION
 * Mostra nello scheda lavoro lo stato dell'invito automatico alla "consulenza visione"
 * (marker job.visioneAutoInviteSentAt) e permette il reinvio manuale riusando l'endpoint
 * esistente /api/jobs/:id/send-consultation-request.
 *
 * Il reinvio manuale registra un workflowEvent `consulenza_inviata` con metadata.templateId:
 * lo scheduler automatico (server/reminder-routes.ts) rispetta sia il marker sia questo
 * evento, quindi un reinvio NON genera doppioni automatici.
 */

import { useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTemplatesByJobType } from '@/lib/consultations';
import { convertFirestoreTimestamp, type FirebaseTimestamp } from '@/lib/firebase';
import type { ConsultationTemplate } from '@shared/consultation-types';
import type { JobTimelineEvent } from '@shared/jobs-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CalendarClock, CheckCircle2, Send, Loader2, Info } from 'lucide-react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface ConsultationVisioneSectionProps {
  jobId: string;
  jobType: string;
  visioneAutoInviteSentAt?: FirebaseTimestamp | null;
  visioneAutoInviteTemplateId?: string;
  workflowEvents?: JobTimelineEvent[];
}

export default function ConsultationVisioneSection({
  jobId,
  jobType,
  visioneAutoInviteSentAt,
  visioneAutoInviteTemplateId,
  workflowEvents = [],
}: ConsultationVisioneSectionProps) {
  const { toast } = useToast();
  const { data: templates = [], isLoading } = useTemplatesByJobType(jobType);

  // Template "consulenza visione" attivo per questo tipo lavoro: stesso criterio dello
  // scheduler (auto-invio attivo, ordine più basso).
  const visioneTemplate = useMemo<ConsultationTemplate | undefined>(() => {
    return [...templates]
      .filter((t) => t.autoInvioVisioneAttivo === true)
      .sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))[0];
  }, [templates]);

  const autoSent = !!visioneAutoInviteSentAt;
  const autoSentDate = convertFirestoreTimestamp(visioneAutoInviteSentAt);

  // Invio manuale già registrato per il template visione (workflowEvent consulenza_inviata).
  const manualEvent = useMemo<JobTimelineEvent | undefined>(() => {
    if (!visioneTemplate) return undefined;
    const matching = (workflowEvents || [])
      .filter(
        (e) =>
          e?.tipo === 'consulenza_inviata' &&
          (e as any)?.metadata?.templateId === visioneTemplate.id &&
          (e as any)?.metadata?.auto !== true,
      )
      .sort((a, b) => {
        const da = convertFirestoreTimestamp((a as any).data)?.getTime() ?? 0;
        const db = convertFirestoreTimestamp((b as any).data)?.getTime() ?? 0;
        return db - da;
      });
    return matching[0];
  }, [workflowEvents, visioneTemplate]);

  const manualSent = !autoSent && !!manualEvent;
  const manualSentDate = manualEvent ? convertFirestoreTimestamp((manualEvent as any).data) : null;

  // Nome del template usato per l'invio automatico (fallback sul template visione attuale).
  const sentTemplateName = useMemo(() => {
    if (visioneAutoInviteTemplateId) {
      const t = templates.find((tpl) => tpl.id === visioneAutoInviteTemplateId);
      if (t) return t.nome;
    }
    return visioneTemplate?.nome;
  }, [templates, visioneAutoInviteTemplateId, visioneTemplate]);

  const sendMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest(
        'POST',
        `/api/jobs/${jobId}/send-consultation-request`,
        { templateId, channel: 'email' },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['job-timeline', jobId] });
      toast({
        title: '✅ Invito inviato',
        description: 'Email con il link di prenotazione consulenza inviata al cliente.',
      });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Invio non riuscito';
      toast({
        variant: 'destructive',
        title: 'Errore invio',
        description: message,
      });
    },
  });

  const handleSend = () => {
    if (!visioneTemplate) return;
    sendMutation.mutate(visioneTemplate.id);
  };

  const isApplicable = !!visioneTemplate || autoSent || manualSent;

  return (
    <Card data-testid="card-consultation-visione">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <CalendarClock className="w-4 h-4" />
          Consulenza Visione
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Caricamento stato invito…</span>
          </div>
        ) : !isApplicable ? (
          <div
            className="flex items-start gap-2 text-gray-500"
            data-testid="text-visione-non-applicabile"
          >
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Non applicabile: nessuna consulenza visione con invito automatico è
              configurata per questo tipo di lavoro.
            </span>
          </div>
        ) : autoSent ? (
          <div className="space-y-2" data-testid="text-visione-auto-sent">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <Badge variant="outline" className="border-green-600 text-green-700">
                Inviato automaticamente
              </Badge>
            </div>
            <p className="text-gray-700">
              Invito consulenza visione inviato automaticamente
              {autoSentDate
                ? ` il ${format(autoSentDate, 'PPP', { locale: it })}`
                : ''}
              {sentTemplateName ? ` (${sentTemplateName})` : ''}.
            </p>
          </div>
        ) : manualSent ? (
          <div className="space-y-2" data-testid="text-visione-manual-sent">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sage" />
              <Badge variant="outline">Inviato manualmente</Badge>
            </div>
            <p className="text-gray-700">
              Invito consulenza visione inviato manualmente
              {manualSentDate
                ? ` il ${format(manualSentDate, 'PPP', { locale: it })}`
                : ''}
              {visioneTemplate?.nome ? ` (${visioneTemplate.nome})` : ''}.
            </p>
          </div>
        ) : (
          <div className="space-y-1" data-testid="text-visione-not-sent">
            <Badge variant="secondary">Non ancora inviato</Badge>
            <p className="text-gray-600">
              L'invito automatico partirà secondo le impostazioni del template
              {visioneTemplate?.nome ? ` "${visioneTemplate.nome}"` : ''}, oppure
              puoi inviarlo subito manualmente.
            </p>
          </div>
        )}

        {visioneTemplate && (
          <Button
            size="sm"
            variant={autoSent || manualSent ? 'outline' : 'default'}
            onClick={handleSend}
            disabled={sendMutation.isPending}
            data-testid="button-send-visione-invite"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            {autoSent || manualSent ? 'Rinvia invito' : 'Invia invito ora'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Sezione Moduli Informativi nel JobDetailDrawer
 * Permette all'admin di inviare moduli logistici ai clienti del job e vedere le risposte.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ClipboardList, Send, Check, Copy, ExternalLink, Loader2, Plus,
  ChevronDown, ChevronUp, Trash2, Phone, Clock, CheckCircle2,
} from 'lucide-react';
import {
  getAllTemplates, sendInfoForm, getSubmissionsByJobId, deleteSubmission,
} from '@/lib/infoForms';
import type { InfoFormTemplate, InfoFormSubmission } from '@shared/info-form-types';
import { createAbsoluteUrl } from '@/lib/basePath';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';
import { apiRequest } from '@/lib/queryClient';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';

interface InfoFormJobSectionProps {
  jobId: string;
  jobName?: string;
  clienti: Array<{
    id?: string;
    nome?: string;
    cognome?: string;
    email?: string;
    whatsapp?: string;
    cellulare1?: string;
  }>;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Testo',
  textarea: 'Testo lungo',
  number: 'Numero',
  select: 'Selezione',
  radio: 'Scelta singola',
  checkbox: 'Scelte multiple',
};

function formatAnswer(type: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
}

function SubmissionCard({
  submission,
  onDelete,
}: {
  submission: InfoFormSubmission;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const formUrl = createAbsoluteUrl(`/modulo/${submission.token}`);
  const isCompleted = submission.status === 'completed';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(formUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const sentDate = submission.sentAt?.toDate ? submission.sentAt.toDate() : null;
  const completedDate = submission.completedAt?.toDate ? submission.completedAt.toDate() : null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className={`border ${isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-200'}`}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-4 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{submission.templateName}</span>
                  <Badge className={isCompleted
                    ? 'bg-green-100 text-green-700 border-green-200'
                    : 'bg-amber-100 text-amber-700 border-amber-200'
                  }>
                    {isCompleted ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <Clock className="h-3 w-3 mr-1" />}
                    {isCompleted ? 'Compilato' : 'In attesa'}
                  </Badge>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Per: <strong>{submission.clientName}</strong>
                  {sentDate && (
                    <span className="ml-2">• {format(sentDate, 'dd/MM/yyyy', { locale: it })}</span>
                  )}
                  {isCompleted && completedDate && (
                    <span className="ml-2 text-green-600">• Compilato il {format(completedDate, 'dd/MM/yyyy HH:mm', { locale: it })}</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50"
                  onClick={e => { e.stopPropagation(); onDelete(); }}
                  title="Elimina modulo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t bg-white/70 p-4 space-y-4">
            {!isCompleted && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-gray-600">Link modulo</Label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={formUrl}
                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700"
                    onClick={e => (e.target as HTMLInputElement).select()}
                  />
                  <Button size="sm" variant="outline" onClick={copyLink} title="Copia link">
                    {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => window.open(formUrl, '_blank')} title="Apri">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}

            {isCompleted && (
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-gray-600">Risposte</Label>
                <div className="space-y-2">
                  {submission.templateFields?.map(field => (
                    <div key={field.id} className="grid grid-cols-[1fr_2fr] gap-2 text-sm">
                      <span className="text-gray-600 font-medium text-xs leading-snug">{field.label}</span>
                      <span className="text-gray-800 text-xs">
                        {formatAnswer(field.type, submission.answers?.[field.id])}
                      </span>
                    </div>
                  ))}
                  {(!submission.templateFields || submission.templateFields.length === 0) && (
                    <p className="text-xs text-gray-400 italic">Nessun campo nel modulo</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function SendFormDialog({
  open,
  jobId,
  jobName,
  clienti,
  onClose,
}: {
  open: boolean;
  jobId: string;
  jobName?: string;
  clienti: InfoFormJobSectionProps['clienti'];
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [selectedClientIds, setSelectedClientIds] = useState<Set<number>>(new Set(clienti.map((_, i) => i)));
  const [sentSubmissions, setSentSubmissions] = useState<InfoFormSubmission[] | null>(null);

  const { data: templates = [], isLoading: loadingTemplates } = useQuery<InfoFormTemplate[]>({
    queryKey: ['infoFormTemplates'],
    queryFn: getAllTemplates,
    enabled: open,
  });

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId) || null;

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error('Seleziona un template');
      const selected = clienti.filter((_, i) => selectedClientIds.has(i));
      if (selected.length === 0) throw new Error('Seleziona almeno un cliente');

      const clients = selected.map(c => ({
        clienteId: c.id,
        clientEmail: c.email || '',
        clientName: [c.nome, c.cognome].filter(Boolean).join(' ') || 'Cliente',
      }));

      if (clients.some(c => !c.clientEmail)) {
        throw new Error('Uno o più clienti selezionati non hanno un\'email');
      }

      const submissions = await sendInfoForm(jobId, selectedTemplate, clients);

      // Invia email a ciascun cliente
      for (const sub of submissions) {
        const formUrl = createAbsoluteUrl(`/modulo/${sub.token}`);
        try {
          await apiRequest('POST', '/api/email/send-info-form-to-client', {
            clientName: sub.clientName,
            clientEmail: sub.clientEmail,
            templateName: sub.templateName,
            formUrl,
            jobName: jobName || 'il tuo evento',
          });
        } catch (_) { /* non bloccare se email fallisce */ }
      }

      return submissions;
    },
    onSuccess: (submissions) => {
      queryClient.invalidateQueries({ queryKey: ['infoFormSubmissions', jobId] });
      setSentSubmissions(submissions);
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' });
    },
  });

  const toggleClient = (index: number) => {
    setSelectedClientIds(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleClose = () => {
    setSelectedTemplateId('');
    setSelectedClientIds(new Set(clienti.map((_, i) => i)));
    setSentSubmissions(null);
    onClose();
  };

  if (sentSubmissions) {
    return (
      <Dialog open={open} onOpenChange={v => !v && handleClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-playfair">Moduli inviati!</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 text-green-600 font-medium">
              <CheckCircle2 className="h-5 w-5" />
              {sentSubmissions.length === 1 ? '1 modulo creato' : `${sentSubmissions.length} moduli creati`}
            </div>
            {sentSubmissions.map(sub => {
              const formUrl = createAbsoluteUrl(`/modulo/${sub.token}`);
              const clienteData = clienti.find(c => c.email === sub.clientEmail);
              const phone = clienteData?.whatsapp || clienteData?.cellulare1;
              const waPhone = phone ? formatPhoneForWhatsApp(phone) : null;
              const waMessage = `Ciao ${sub.clientName}! Ti inviamo il link al modulo "${sub.templateName}" per il tuo evento. Compilalo quando puoi: ${formUrl}`;
              return (
                <div key={sub.id} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                  <p className="text-sm font-medium">{sub.clientName} — {sub.clientEmail}</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={formUrl}
                      className="flex-1 px-2 py-1.5 bg-white border border-gray-200 rounded text-xs"
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigator.clipboard.writeText(formUrl)}
                      title="Copia"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  {waPhone && (
                    <Button
                      size="sm"
                      className="w-full bg-[#25D366] hover:bg-[#20BD5A] text-white border-0"
                      onClick={() => window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`, '_blank')}
                    >
                      <Phone className="h-3.5 w-3.5 mr-2" />
                      Invia su WhatsApp a {sub.clientName}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button onClick={handleClose} className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white">
              Chiudi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-playfair">Invia Modulo Informativo</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label>Template modulo *</Label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Caricamento template...
              </div>
            ) : templates.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                Nessun template disponibile. Crea prima un template dalla sezione "Moduli" nel menu admin.
              </p>
            ) : (
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona un template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.fields?.length || 0} campi)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedTemplate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">Campi nel modulo:</p>
              <div className="flex flex-wrap gap-1">
                {selectedTemplate.fields.map(f => (
                  <Badge key={f.id} variant="outline" className="text-xs text-blue-700 border-blue-200">
                    {f.label}{f.required && '*'}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Destinatari *</Label>
            {clienti.length === 0 ? (
              <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                Nessun cliente collegato a questo job.
              </p>
            ) : (
              <div className="space-y-2">
                {clienti.map((c, i) => {
                  const name = [c.nome, c.cognome].filter(Boolean).join(' ') || 'Cliente';
                  const email = c.email || '';
                  const isSelected = selectedClientIds.has(i);
                  return (
                    <label key={i} className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      isSelected ? 'border-[#6b7f6b] bg-[#6b7f6b]/5' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleClient(i)}
                        className="mt-0.5 h-4 w-4 text-[#6b7f6b] border-gray-300 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{name}</p>
                        {email ? (
                          <p className="text-xs text-gray-500">{email}</p>
                        ) : (
                          <p className="text-xs text-red-500">Nessuna email — il modulo verrà creato ma l'email non sarà inviata</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>Annulla</Button>
          <Button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || !selectedTemplateId || selectedClientIds.size === 0}
            className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white"
          >
            {sendMutation.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />Invio...</>
            ) : (
              <><Send className="h-4 w-4 mr-2" />Invia modulo</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InfoFormJobSection({ jobId, jobName, clienti }: InfoFormJobSectionProps) {
  const { toast } = useToast();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: submissions = [], isLoading } = useQuery<InfoFormSubmission[]>({
    queryKey: ['infoFormSubmissions', jobId],
    queryFn: () => getSubmissionsByJobId(jobId),
    enabled: !!jobId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSubmission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infoFormSubmissions', jobId] });
      toast({ title: 'Modulo eliminato' });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: 'Errore eliminazione', variant: 'destructive' });
      setDeleteId(null);
    },
  });

  const pending = submissions.filter(s => s.status === 'pending').length;
  const completed = submissions.filter(s => s.status === 'completed').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-[#6b7f6b]" />
            <span className="font-medium text-sm">Moduli Informativi</span>
          </div>
          {submissions.length > 0 && (
            <div className="flex items-center gap-1.5">
              {completed > 0 && (
                <Badge className="bg-green-100 text-green-700 text-xs">{completed} compilati</Badge>
              )}
              {pending > 0 && (
                <Badge className="bg-amber-100 text-amber-700 text-xs">{pending} in attesa</Badge>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          onClick={() => setSendDialogOpen(true)}
          className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white"
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Invia Modulo
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      )}

      {!isLoading && submissions.length === 0 && (
        <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm text-gray-400">Nessun modulo inviato</p>
          <p className="text-xs text-gray-400 mt-1">Clicca "Invia Modulo" per raccogliere informazioni logistiche dal cliente</p>
        </div>
      )}

      <div className="space-y-3">
        {submissions.map(sub => (
          <SubmissionCard
            key={sub.id}
            submission={sub}
            onDelete={() => setDeleteId(sub.id)}
          />
        ))}
      </div>

      <SendFormDialog
        open={sendDialogOpen}
        jobId={jobId}
        jobName={jobName}
        clienti={clienti}
        onClose={() => setSendDialogOpen(false)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina modulo</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo modulo? Se il cliente non l'ha ancora compilato, il link smetterà di funzionare.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

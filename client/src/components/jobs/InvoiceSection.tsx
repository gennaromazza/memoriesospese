import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText, Loader2, Plus, RefreshCw } from 'lucide-react';
import { nanoid } from 'nanoid';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { InvoiceHistoryItem, InvoiceTaxTreatment } from '@shared/fatture-types';

interface InvoiceClient {
  id: string;
  nome: string;
  cognome: string;
  email?: string;
}

interface InvoiceSectionProps {
  jobId: string;
  jobName: string;
  clienti: InvoiceClient[];
}

const taxOptions: Array<{ value: InvoiceTaxTreatment; label: string }> = [
  { value: 'iva_ordinaria', label: 'IVA ordinaria 22%' },
  { value: 'iva_10', label: 'IVA 10%' },
  { value: 'iva_5', label: 'IVA 5%' },
  { value: 'iva_4', label: 'IVA 4%' },
  { value: 'esente', label: 'Esente IVA (N4)' },
  { value: 'non_imponibile', label: 'Non imponibile (N3.5)' },
  { value: 'fuori_campo', label: 'Non soggetta IVA — N2.2 (forfettario)' },
];

interface InvoiceFormError {
  message: string;
  missing: string[];
  errors: string[];
  guidance: string[];
}

function toDisplayText(value: unknown, fallback = 'Operazione non riuscita'): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) return value.message;

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.message === 'string') {
      const code = typeof record.code === 'string' ? `${record.code}: ` : '';
      return `${code}${record.message}`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function toDisplayTextArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => toDisplayText(item)).filter(Boolean)
    : [];
}

function parseError(error: unknown): InvoiceFormError {
  const fallback = toDisplayText(error);
  const raw = fallback.includes(': ') ? fallback.slice(fallback.indexOf(': ') + 2) : fallback;
  try {
    const body = JSON.parse(raw);
    return {
      message: toDisplayText(body?.error, fallback),
      missing: toDisplayTextArray(body?.missing),
      errors: toDisplayTextArray(body?.errors),
      guidance: toDisplayTextArray(body?.guidance),
    };
  } catch {
    return { message: fallback, missing: [], errors: [], guidance: [] };
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'fattura.xml';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function InvoiceSection({ jobId, jobName, clienti }: InvoiceSectionProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [clienteId, setClienteId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [taxableAmount, setTaxableAmount] = useState('');
  const [description, setDescription] = useState(`Servizio fotografico - ${jobName}`);
  const [taxTreatment, setTaxTreatment] = useState<InvoiceTaxTreatment>('iva_ordinaria');
  const [idempotencyKey, setIdempotencyKey] = useState(() => nanoid());
  const [preview, setPreview] = useState<{
    totals: { imponibile: number; imposta: number; totale: number; aliquota: number; natura?: string };
    sender: { name: string; regimeFiscale: string };
    recipient: { name: string };
  } | null>(null);
  const [formError, setFormError] = useState<InvoiceFormError | null>(null);

  const historyQuery = useQuery<{ invoices: InvoiceHistoryItem[] }>({
    queryKey: ['invoices', jobId],
    queryFn: async () => (await apiRequest('GET', `/api/invoices/job/${jobId}`)).json(),
    enabled: !!jobId,
  });

  useEffect(() => {
    if (!clienteId && clienti[0]) setClienteId(clienti[0].id);
  }, [clienti, clienteId]);

  const draft = {
    jobId,
    clienteId,
    issueDate,
    taxableAmount: Number(taxableAmount.replace(',', '.')),
    description,
    taxTreatment,
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/invoices/preview', draft);
      return response.json();
    },
    onSuccess: (data) => {
      setFormError(null);
      setPreview(data);
    },
    onError: (error) => setFormError(parseError(error)),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/invoices', {
        ...draft,
        idempotencyKey,
      });
      return response.json();
    },
    onSuccess: async (data) => {
      const xmlResponse = await apiRequest('GET', `/api/invoices/${data.invoiceId}/xml`);
      downloadBlob(await xmlResponse.blob(), data.filename || 'fattura.xml');
      setDialogOpen(false);
      setPreview(null);
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['invoices', jobId] });
      toast({ title: 'Fattura XML creata', description: `${data.numero || 'Fattura'} scaricata sul dispositivo.` });
    },
    onError: (error) => setFormError(parseError(error)),
  });

  const downloadInvoice = async (invoice: InvoiceHistoryItem) => {
    try {
      const response = await apiRequest('GET', `/api/invoices/${invoice.id}/xml`);
      downloadBlob(await response.blob(), invoice.filename);
    } catch (error) {
      toast({ title: 'Download non riuscito', description: error instanceof Error ? error.message : 'Impossibile scaricare il file XML', variant: 'destructive' });
    }
  };

  const openDialog = () => {
    setClienteId(clienti[0]?.id || '');
    setIssueDate(new Date().toISOString().slice(0, 10));
    setTaxableAmount('');
    setDescription(`Servizio fotografico - ${jobName}`);
    setTaxTreatment('iva_ordinaria');
    setIdempotencyKey(nanoid());
    setPreview(null);
    setFormError(null);
    setDialogOpen(true);
  };

  return (
    <>
      <Card className="shadow-sm hover:shadow-md transition-shadow">
        <CardHeader className="bg-gradient-to-r from-amber-50 to-transparent dark:from-amber-950/20">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-700" />
            Fatture elettroniche XML
            <Button size="sm" className="ml-auto" onClick={openDialog} disabled={clienti.length === 0}>
              <Plus className="h-4 w-4 mr-1" /> Nuova fattura
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {historyQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Caricamento storico...</div>
          ) : historyQuery.data?.invoices?.length ? (
            <div className="space-y-2">
              {historyQuery.data.invoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="font-medium">{invoice.numero} · € {invoice.totals.totale.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground truncate">{invoice.issueDate} · {invoice.description}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => downloadInvoice(invoice)}>
                    <Download className="h-4 w-4 mr-1" /> XML
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nessuna fattura XML emessa per questo lavoro.</p>
          )}
          <p className="text-xs text-muted-foreground mt-3">Il file è pronto per l’importazione manuale in Aruba Fatturazione Elettronica. Non viene inviato automaticamente allo SdI.</p>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nuova fattura elettronica XML</DialogTitle>
            <DialogDescription>Compila i dati manuali. Il calcolo parte dall’imponibile indicato e non dai pagamenti del lavoro.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
              <p><strong>Mittente:</strong> partita IVA, regime fiscale RFxx e indirizzo strutturato vengono dalle <strong>Impostazioni studio → Dati fiscali</strong> e devono essere salvati lì.</p>
              <p className="mt-1"><strong>Cliente:</strong> usa i dati di fatturazione dell’intestatario. Per un privato con codice fiscale e indirizzo completi, senza SDI o PEC, l’XML usa automaticamente <code>0000000</code>; l’email normale non è una PEC.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Intestatario</Label>
              <Select value={clienteId} onValueChange={(value) => { setClienteId(value); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Seleziona cliente" /></SelectTrigger>
                <SelectContent>
                  {clienti.map((cliente) => <SelectItem key={cliente.id} value={cliente.id}>{cliente.nome} {cliente.cognome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="invoice-date">Data emissione</Label>
                <Input id="invoice-date" type="date" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); setPreview(null); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invoice-amount">Imponibile (€)</Label>
                <Input id="invoice-amount" inputMode="decimal" placeholder="0,00" value={taxableAmount} onChange={(e) => { setTaxableAmount(e.target.value); setPreview(null); }} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Trattamento IVA/fiscale</Label>
              <Select value={taxTreatment} onValueChange={(value) => { setTaxTreatment(value as InvoiceTaxTreatment); setPreview(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{taxOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
              </Select>
              {taxTreatment === 'fuori_campo' && (
                <p className="text-xs text-muted-foreground">Con studio in regime RF19 l’XML riporta natura N2.2, IVA a zero e la causale normativa del regime forfettario.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invoice-description">Descrizione</Label>
              <Textarea id="invoice-description" value={description} onChange={(e) => { setDescription(e.target.value); setPreview(null); }} rows={3} />
            </div>
            {formError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium">{formError.message}</p>
                {formError.missing.length > 0 && <><p className="mt-2 font-medium">Dati mancanti:</p><ul className="list-disc ml-5">{formError.missing.map((item) => <li key={item}>{item}</li>)}</ul></>}
                {formError.errors.length > 0 && <ul className="list-disc ml-5 mt-1">{formError.errors.map((item) => <li key={item}>{item}</li>)}</ul>}
                {formError.guidance.length > 0 && <><p className="mt-2 font-medium">Come correggere:</p><ul className="list-disc ml-5">{formError.guidance.map((item) => <li key={item}>{item}</li>)}</ul></>}
              </div>
            )}
            {preview && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
                <p className="font-medium">Riepilogo per {preview.recipient.name}</p>
                <p className="text-xs text-amber-900">Mittente: {preview.sender.name} · {preview.sender.regimeFiscale}</p>
                <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                  <span>Imponibile<br /><strong>€ {preview.totals.imponibile.toFixed(2)}</strong></span>
                  <span>IVA {preview.totals.aliquota.toFixed(0)}%<br /><strong>€ {preview.totals.imposta.toFixed(2)}</strong></span>
                  <span>Totale<br /><strong className="text-base">€ {preview.totals.totale.toFixed(2)}</strong></span>
                </div>
                {preview.totals.natura && <p className="mt-2 text-sm">Natura IVA: <strong>{preview.totals.natura}</strong></p>}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annulla</Button>
            {!preview ? (
              <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
                {previewMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Calcola anteprima
              </Button>
            ) : (
              <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Crea e scarica XML
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
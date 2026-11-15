import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { formatIban, isValidIban, normalizeIban } from '@shared/client-area';

interface FormState {
  iban: string;
  intestatario: string;
  banca: string;
  causale: string;
  welcomeAuto: boolean;
}

const EMPTY: FormState = { iban: '', intestatario: '', banca: '', causale: '', welcomeAuto: true };
const QUERY_KEY = ['client-area-settings'];

/**
 * Impostazioni dell'Area Cliente: coordinate bancarie mostrate ai clienti
 * nella sezione pagamenti. Visibili solo ai clienti che hanno fatto l'accesso.
 */
export default function ClientAreaSettingsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => (await apiRequest('GET', '/api/client-area/admin/settings')).json() as Promise<FormState>,
  });

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data, iban: data.iban ? formatIban(data.iban) : '' });
  }, [data]);

  const ibanFilled = normalizeIban(form.iban).length > 0;
  const ibanInvalid = ibanFilled && !isValidIban(form.iban);
  const intestatarioMissing = ibanFilled && !form.intestatario.trim();

  const update = (field: 'iban' | 'intestatario' | 'banca' | 'causale') => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [field]: event.target.value }));

  const save = async () => {
    if (ibanInvalid || intestatarioMissing) return;
    setSaving(true);
    try {
      const res = await apiRequest('PUT', '/api/client-area/admin/settings', { ...form, iban: normalizeIban(form.iban) });
      const saved = await res.json() as FormState;
      queryClient.setQueryData(QUERY_KEY, saved);
      toast({ title: 'Impostazioni salvate', description: saved.iban ? 'I clienti vedranno queste coordinate nella loro area.' : 'Nessun IBAN mostrato ai clienti.' });
    } catch (error) {
      toast({ title: 'Salvataggio non riuscito', description: error instanceof Error ? error.message : 'Riprova.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-[#6b7f6b]/20 bg-[#6b7f6b]/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6b7f6b] text-white shadow-sm">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight text-stone-800">Area clienti</h2>
            <p className="mt-0.5 text-xs text-stone-500">Invito all'area personale e coordinate bancarie per i pagamenti</p>
          </div>
        </div>
        <Button onClick={save} disabled={saving || isLoading || ibanInvalid || intestatarioMissing} className="gap-2 bg-[#6b7f6b] text-white hover:bg-[#5a6e5a]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salva
        </Button>
      </div>

      {isError ? (
        <p className="text-sm text-destructive">Impossibile caricare le impostazioni dell'area clienti.</p>
      ) : (
        <div className="grid gap-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div className="flex items-start justify-between gap-4 rounded-lg bg-stone-50 p-4 sm:col-span-2">
            <div>
              <Label htmlFor="ca-welcome">Invito automatico all'area</Label>
              <p className="mt-1 text-xs text-stone-500">
                Quando colleghi un cliente a un lavoro, riceve una sola volta l'email con il link alla sua area personale, firmato o no.
              </p>
            </div>
            <Switch id="ca-welcome" checked={form.welcomeAuto} disabled={isLoading} onCheckedChange={checked => setForm(prev => ({ ...prev, welcomeAuto: checked }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ca-iban">IBAN</Label>
            <Input id="ca-iban" value={form.iban} onChange={update('iban')} placeholder="IT00 X000 0000 0000 0000 0000 000" autoComplete="off" disabled={isLoading} aria-invalid={ibanInvalid} />
            {ibanInvalid && <p className="text-xs text-destructive">IBAN non valido: controlla le cifre.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-intestatario">Intestatario</Label>
            <Input id="ca-intestatario" value={form.intestatario} onChange={update('intestatario')} disabled={isLoading} aria-invalid={intestatarioMissing} />
            {intestatarioMissing && <p className="text-xs text-destructive">Indica l'intestatario del conto.</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ca-banca">Banca (facoltativo)</Label>
            <Input id="ca-banca" value={form.banca} onChange={update('banca')} disabled={isLoading} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ca-causale">Causale suggerita (facoltativo)</Label>
            <Input id="ca-causale" value={form.causale} onChange={update('causale')} placeholder="Pagamento {evento}" disabled={isLoading} />
            <p className="text-xs text-stone-500">Scrivi <code>{'{evento}'}</code> per inserire il nome del lavoro, ad esempio "Acconto {'{evento}'}".</p>
          </div>
          <p className="text-xs text-stone-500 sm:col-span-2">Lascia vuoto l'IBAN per non mostrare coordinate bancarie. I clienti vedono questi dati solo dopo aver fatto l'accesso alla loro area.</p>
        </div>
      )}
    </div>
  );
}

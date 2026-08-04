import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { Cliente, InsertCliente, UpdateCliente } from '@shared/clienti-types';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Save, X, Instagram, ExternalLink, Info } from 'lucide-react';
import { useWatch } from 'react-hook-form';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatPhoneForWhatsApp } from '@shared/phone-utils';
import {
  isEmptyOrValidCodiceFiscale,
  isEmptyOrValidPartitaIva,
  isEmptyOrValidCodiceSdi,
  isEmptyOrValidPec,
  normalizeFiscalString,
} from '@shared/fiscal-validation';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Receipt } from 'lucide-react';
import { useState } from 'react';

const clienteSchema = z.object({
  nome: z.string().min(1, 'Nome obbligatorio'),
  cognome: z.string().min(1, 'Cognome obbligatorio'),
  email: z.string().email('Email non valida').min(1, 'Email obbligatoria'),
  cellulare1: z.string().optional(),
  cellulare2: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
  via: z.string().optional(),
  citta: z.string().optional(),
  cap: z.string().optional(),
  provincia: z.string().optional(),
  tipoSoggetto: z.enum(['privato', 'azienda']).optional(),
  codiceFiscale: z.string().optional().refine(isEmptyOrValidCodiceFiscale, {
    message: 'Codice fiscale non valido (controlla il carattere finale)',
  }),
  partitaIva: z.string().optional().refine(isEmptyOrValidPartitaIva, {
    message: 'Partita IVA non valida (11 cifre con controllo)',
  }),
  ragioneSociale: z.string().optional(),
  codiceSdi: z.string().optional().refine(isEmptyOrValidCodiceSdi, {
    message: 'Codice SDI non valido (7 caratteri, es. M5UXCR1 o 0000000)',
  }),
  pec: z.string().optional().refine(isEmptyOrValidPec, {
    message: 'PEC non valida (formato email)',
  }),
  dataNascita: z.string().optional(),
  luogoNascita: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.enum(['lead', 'prospect', 'cliente_attivo', 'archiviato']).optional(),
});

type ClienteFormData = z.infer<typeof clienteSchema>;

interface ClienteFormProps {
  cliente?: Cliente | null;
  onSubmit: (data: InsertCliente | UpdateCliente) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export default function ClienteForm({ 
  cliente, 
  onSubmit, 
  onCancel,
  isSubmitting = false 
}: ClienteFormProps) {
  const isEdit = !!cliente;
  
  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nome: cliente?.nome || '',
      cognome: cliente?.cognome || '',
      email: cliente?.email || '',
      cellulare1: cliente?.cellulare1 || '',
      cellulare2: cliente?.cellulare2 || '',
      whatsapp: cliente?.whatsapp || '',
      instagram: cliente?.instagram || '',
      via: cliente?.via || '',
      citta: cliente?.citta || '',
      cap: cliente?.cap || '',
      provincia: cliente?.provincia || '',
      tipoSoggetto: cliente?.tipoSoggetto || 'privato',
      codiceFiscale: cliente?.codiceFiscale || '',
      partitaIva: cliente?.partitaIva || '',
      ragioneSociale: cliente?.ragioneSociale || '',
      codiceSdi: cliente?.codiceSdi || '',
      pec: cliente?.pec || '',
      dataNascita: cliente?.dataNascita || '',
      luogoNascita: cliente?.luogoNascita || '',
      note: cliente?.note || '',
      tags: cliente?.tags || [],
      status: cliente?.lifecycle?.status || 'lead',
    },
  });

  const hasFiscalData = !!(
    cliente?.codiceFiscale || cliente?.partitaIva || cliente?.ragioneSociale ||
    cliente?.codiceSdi || cliente?.pec || cliente?.dataNascita || cliente?.luogoNascita
  );
  const [fiscaleOpen, setFiscaleOpen] = useState(hasFiscalData);
  const tipoSoggetto = useWatch({ control: form.control, name: 'tipoSoggetto' });
  const isAzienda = tipoSoggetto === 'azienda';

  const instagramRaw = useWatch({ control: form.control, name: 'instagram' });
  const instagramHandle = instagramRaw?.trim().replace(/^@+/, '').trim() || '';

  const handleSubmit = (data: ClienteFormData) => {
    const emptyFiscal = isEdit ? '' : undefined;
    // Formatta automaticamente i numeri di telefono per WhatsApp
    // Strip del @ iniziale dall'handle Instagram prima del salvataggio
    const formattedData = {
      ...data,
      cellulare1: data.cellulare1 ? formatPhoneForWhatsApp(data.cellulare1) || data.cellulare1 : undefined,
      cellulare2: data.cellulare2 ? formatPhoneForWhatsApp(data.cellulare2) || data.cellulare2 : undefined,
      whatsapp: data.whatsapp ? formatPhoneForWhatsApp(data.whatsapp) || data.whatsapp : undefined,
      instagram: data.instagram?.trim().replace(/^@+/, '').trim() || undefined,
      // In modifica: stringa vuota (per poter cancellare valori salvati — updateCliente scarta undefined)
      // In creazione: undefined (per non scrivere campi vuoti su Firestore)
      codiceFiscale: data.codiceFiscale?.trim() ? normalizeFiscalString(data.codiceFiscale) : emptyFiscal,
      partitaIva: data.partitaIva?.trim() ? normalizeFiscalString(data.partitaIva).replace(/^IT/, '') : emptyFiscal,
      ragioneSociale: data.ragioneSociale?.trim() || emptyFiscal,
      codiceSdi: data.codiceSdi?.trim() ? normalizeFiscalString(data.codiceSdi) : emptyFiscal,
      pec: data.pec?.trim().toLowerCase() || emptyFiscal,
      dataNascita: data.dataNascita?.trim() || emptyFiscal,
      luogoNascita: data.luogoNascita?.trim() || emptyFiscal,
    };
    onSubmit(formattedData);
  };

  return (
    <Form {...form}>
      <form 
        onSubmit={form.handleSubmit(handleSubmit)} 
        className="space-y-6"
        data-testid="form-cliente"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Mario" 
                    data-testid="input-nome"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cognome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cognome *</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Rossi" 
                    data-testid="input-cognome"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email *</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  type="email" 
                  placeholder="mario.rossi@example.com" 
                  data-testid="input-email"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="cellulare1"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cellulare Principale</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="+39 123 456 7890" 
                    data-testid="input-cellulare1"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cellulare2"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cellulare Secondario</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="+39 098 765 4321" 
                    data-testid="input-cellulare2"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="whatsapp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>WhatsApp</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="+39 123 456 7890" 
                    data-testid="input-whatsapp"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="instagram"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1.5">
                <Instagram className="h-3.5 w-3.5" />
                Account Instagram
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm select-none">@</span>
                  <Input
                    {...field}
                    className="pl-7"
                    placeholder="nomeutente"
                    data-testid="input-instagram"
                  />
                </div>
              </FormControl>
              <FormMessage />
              {instagramHandle && (
                <div className="flex items-center gap-1.5 mt-1">
                  <a
                    href={`https://www.instagram.com/${instagramHandle}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-pink-500 hover:text-pink-600 underline underline-offset-2"
                  >
                    <ExternalLink className="h-3 w-3" />
                    instagram.com/{instagramHandle}
                  </a>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[220px] text-xs">
                      Clicca il link per verificare il profilo. Se l'handle è sbagliato, Instagram mostrerà "Utente non trovato".
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <FormField
              control={form.control}
              name="via"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Via</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Via Roma, 123" 
                      data-testid="input-via"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="citta"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Città</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="Milano" 
                    data-testid="input-citta"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="cap"
            render={({ field }) => (
              <FormItem>
                <FormLabel>CAP</FormLabel>
                <FormControl>
                  <Input 
                    {...field} 
                    placeholder="20100" 
                    data-testid="input-cap"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="provincia"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provincia</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  placeholder="MI" 
                  maxLength={2}
                  data-testid="input-provincia"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Collapsible open={fiscaleOpen} onOpenChange={setFiscaleOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50 transition-colors"
              data-testid="button-toggle-fatturazione"
            >
              <span className="flex items-center gap-2">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                Dati di fatturazione
                {hasFiscalData && (
                  <span className="text-xs font-normal text-muted-foreground">(compilati)</span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${fiscaleOpen ? 'rotate-180' : ''}`} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <FormField
              control={form.control}
              name="tipoSoggetto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo soggetto</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      // Ripulisce i campi non pertinenti al nuovo tipo soggetto,
                      // per non salvare (o bloccare con) valori nascosti
                      if (value === 'privato') {
                        form.setValue('partitaIva', '');
                        form.setValue('ragioneSociale', '');
                        form.setValue('codiceSdi', '');
                      } else {
                        form.setValue('dataNascita', '');
                        form.setValue('luogoNascita', '');
                      }
                      form.clearErrors(['partitaIva', 'ragioneSociale', 'codiceSdi', 'dataNascita', 'luogoNascita']);
                    }}
                    value={field.value || 'privato'}
                    data-testid="select-tipo-soggetto"
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Privato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="privato">Privato</SelectItem>
                      <SelectItem value="azienda">Azienda / P.IVA</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codiceFiscale"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Codice Fiscale</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="RSSMRA85M01H501Q"
                        maxLength={16}
                        className="uppercase"
                        data-testid="input-codice-fiscale"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {isAzienda ? (
                <FormField
                  control={form.control}
                  name="partitaIva"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Partita IVA</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="01234567890"
                          maxLength={13}
                          data-testid="input-partita-iva"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : (
                <FormField
                  control={form.control}
                  name="dataNascita"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data di nascita</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="date"
                          data-testid="input-data-nascita"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {isAzienda ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="ragioneSociale"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ragione sociale</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Rossi S.r.l."
                          data-testid="input-ragione-sociale"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="codiceSdi"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Codice SDI</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="M5UXCR1 (o 0000000)"
                          maxLength={7}
                          className="uppercase"
                          data-testid="input-codice-sdi"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            ) : (
              <FormField
                control={form.control}
                name="luogoNascita"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Luogo di nascita</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Milano"
                        data-testid="input-luogo-nascita"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="pec"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>PEC</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="nome@pec.it"
                      data-testid="input-pec"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CollapsibleContent>
        </Collapsible>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <Select 
                onValueChange={field.onChange} 
                defaultValue={field.value}
                data-testid="select-status"
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="cliente_attivo">Cliente Attivo</SelectItem>
                  <SelectItem value="archiviato">Archiviato</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  placeholder="Note interne..."
                  rows={4}
                  data-testid="textarea-note"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3 justify-end pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="button-cancel"
          >
            <X className="h-4 w-4 mr-2" />
            Annulla
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-submit"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Salvataggio...' : isEdit ? 'Aggiorna Cliente' : 'Crea Cliente'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

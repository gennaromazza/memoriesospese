/**
 * QUOTE BUILDER
 * Interfaccia admin per creare preventivi personalizzati
 */

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { createQuote, getAllQuoteTemplates } from '@/lib/quotes';
import { getAllProducts } from '@/lib/products';
import { mergeQuoteProducts } from '@/lib/quote-mappers';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import CatalogProductSelector from './CatalogProductSelector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Plus,
  Trash2,
  FileText,
  Palette,
  Loader2,
  Calendar,
  Euro
} from 'lucide-react';
import type { QuoteType, QuoteProduct } from '@shared/quotes-types';
import type { JobType as JobTypeSlug } from '@shared/jobs-types';
import type { JobType } from '@shared/job-types';
import { DEFAULT_CLAUSES } from '@shared/contract-clause-types';

const quoteSchema = z.object({
  jobId: z.string().min(1),
  clienteId: z.string().min(1),
  type: z.enum(['fisso', 'variabile']),
  templateId: z.string().optional(),
  catalogProductIds: z.array(z.string()).default([]),
  products: z.array(z.object({
    nome: z.string().min(1, 'Nome prodotto obbligatorio'),
    descrizione: z.string(),
    prezzo: z.number().min(0),
    selectable: z.boolean(),
    numeroFoto: z.number().optional(),
    categoria: z.string().optional(),
    immagini: z.array(z.string()).optional()
  })),
  theme: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    footerText: z.string().optional()
  }).optional(),
  expiresAt: z.date().optional(),
  noteInterne: z.string().optional()
}).refine(
  (data) => data.catalogProductIds.length > 0 || data.products.some(p => p.nome.trim()),
  { message: 'Aggiungi almeno un prodotto (catalogo o custom)', path: ['products'] }
);

type FormData = z.infer<typeof quoteSchema>;

interface QuoteBuilderProps {
  jobId: string;
  clienteId: string;
  jobType: JobType;
  jobTypeSlug: JobTypeSlug;
  open: boolean;
  onClose: () => void;
}

export default function QuoteBuilder({
  jobId,
  clienteId,
  jobType,
  jobTypeSlug,
  open,
  onClose
}: QuoteBuilderProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Query templates
  const { data: templates = [] } = useQuery({
    queryKey: ['quote-templates'],
    queryFn: getAllQuoteTemplates
  });

  // Query catalog products
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getAllProducts
  });

  // Filtro templates per tipo job usando lo slug
  const filteredTemplates = templates.filter(t => t.jobType === jobType.slug && t.attivo);

  const form = useForm<FormData>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      jobId,
      clienteId,
      type: 'fisso',
      catalogProductIds: [],
      products: [{
        nome: '',
        descrizione: '',
        prezzo: 0,
        selectable: false,
        numeroFoto: 0,
        categoria: '',
        immagini: []
      }],
      theme: {
        primaryColor: '#8B9A8B',
        secondaryColor: '#C8B8A8',
        footerText: 'Image Studio - Fotografia professionale'
      },
      noteInterne: ''
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'products'
  });

  // Watch form values for totals
  const catalogProductIds = form.watch('catalogProductIds') || [];
  const customProducts = form.watch('products') || [];

  // Calcola totale unificato (catalog + custom) - wrapped in useMemo to prevent loop
  const totaleCatalogo = useMemo(() => {
    return catalogProductIds.reduce((sum, id) => {
      const product = catalogProducts.find(p => p.id === id);
      return sum + (product?.prezzoFinale || product?.prezzo || 0);
    }, 0);
  }, [catalogProductIds, catalogProducts]);

  const totaleCustom = useMemo(() => {
    return customProducts
      .filter(p => p.nome?.trim())
      .reduce((sum, p) => sum + (p.prezzo || 0), 0);
  }, [customProducts]);

  const totale = totaleCatalogo + totaleCustom;

  // Load template
  const handleLoadTemplate = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (!template) return;

    setSelectedTemplateId(templateId);
    form.setValue('type', template.type);
    form.setValue('products', template.defaultProducts.map(p => ({
      ...p,
      selectable: template.type === 'variabile'
    })));
    form.setValue('theme', template.theme);
  };

  // Mutation crea preventivo
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Merge catalog + custom products
      const mergedProducts = mergeQuoteProducts(
        data.catalogProductIds,
        data.products.filter(p => p.nome.trim()), // Solo custom con nome
        catalogProducts,
        data.type
      );

      // Prepara clausole dal jobTypeSlug con fallback
      const clauses = DEFAULT_CLAUSES[jobTypeSlug] || [];
      const defaultClauses = clauses.map(c => ({
        id: nanoid(),
        text: c.text,
        required: c.required,
        ordine: c.ordine
      }));

      const quoteData = {
        jobId: data.jobId,
        clienteId: data.clienteId,
        type: data.type,
        products: mergedProducts,
        theme: data.theme,
        expiresAt: data.expiresAt,
        noteInterne: data.noteInterne,
        templateId: selectedTemplateId || undefined,
        contractClauses: defaultClauses
      };

      return createQuote(quoteData, user!.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotes', 'job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      toast({
        title: 'Preventivo creato!',
        description: 'Il preventivo è stato creato con successo.'
      });
      form.reset();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Reset state when dialog closes (not on every render)
  useEffect(() => {
    if (!open) {
      setSelectedTemplateId('');
      form.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // Only depend on 'open', not 'form' (form ref is stable)

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  // Stabilizza il callback per evitare loop infiniti
  const handleDialogChange = useCallback(
    (isOpen: boolean) => {
      if (!isOpen) onClose();
    },
    [onClose]
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>

    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{jobType.icona}</span>
            <FileText className="w-5 h-5" />
            Crea Preventivo
          </DialogTitle>
          <DialogDescription>
            Crea un preventivo personalizzato per il lavoro <span style={{ color: jobType.colore }} className="font-semibold">{jobType.nome}</span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Template selector */}
            {filteredTemplates.length > 0 && (
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Palette className="w-4 h-4" />
                    Carica da Template
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
                    <SelectTrigger data-testid="select-template">
                      <SelectValue placeholder="Seleziona template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredTemplates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.nome} ({template.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-4">
              {/* Tipo preventivo */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Preventivo *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger data-testid="select-quote-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fisso">Fisso (prezzo totale)</SelectItem>
                        <SelectItem value="variabile">Variabile (cliente sceglie)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {field.value === 'fisso'
                        ? 'Il cliente vede solo il totale e firma'
                        : 'Il cliente può selezionare i prodotti desiderati'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Data scadenza */}
              <FormField
                control={form.control}
                name="expiresAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Scadenza</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        value={field.value ? field.value.toISOString().split('T')[0] : ''}
                        onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                        data-testid="input-expires-at"
                      />
                    </FormControl>
                    <FormDescription>
                      Il link preventivo scadrà dopo questa data
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Sezione 1: Catalogo Prodotti */}
            <div>
              <h3 className="text-lg font-semibold mb-4">1. Prodotti dal Catalogo</h3>
              <Card>
                <CardContent className="pt-6">
                  <FormField
                    control={form.control}
                    name="catalogProductIds"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <CatalogProductSelector
                            selectedProductIds={field.value}
                            onSelectionChange={field.onChange}
                            products={catalogProducts}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Sezione 2: Prodotti Custom */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">2. Prodotti Custom (opzionale)</h3>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => append({
                    nome: '',
                    descrizione: '',
                    prezzo: 0,
                    selectable: form.watch('type') === 'variabile',
                    numeroFoto: 0,
                    categoria: '',
                    immagini: []
                  })}
                  data-testid="button-add-custom-product"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Prodotto Custom
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <Card key={field.id}>
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <Badge variant="outline">Prodotto {index + 1}</Badge>
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(index)}
                              data-testid={`button-remove-product-${index}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name={`products.${index}.nome`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nome *</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="es. Album 30x30"
                                    {...field}
                                    data-testid={`input-product-name-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`products.${index}.prezzo`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Prezzo € *</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    {...field}
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    data-testid={`input-product-price-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name={`products.${index}.descrizione`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Descrizione</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Descrizione dettagliata del prodotto..."
                                  rows={2}
                                  {...field}
                                  data-testid={`textarea-product-description-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name={`products.${index}.numeroFoto`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>N° Foto</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    {...field}
                                    value={field.value || ''}
                                    onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                    data-testid={`input-product-photos-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`products.${index}.categoria`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Categoria</FormLabel>
                                <FormControl>
                                  <Input
                                    placeholder="es. Album, Video, Stampe"
                                    {...field}
                                    value={field.value || ''}
                                    data-testid={`input-product-category-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Riepilogo Totale */}
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-6">
                <div className="space-y-3">
                  {/* Breakdown */}
                  {(catalogProductIds.length > 0 || customProducts.some(p => p.nome.trim())) && (
                    <div className="space-y-2 pb-3 border-b border-green-200">
                      {catalogProductIds.length > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-green-700">
                            Catalogo ({catalogProductIds.length} prodotti)
                          </span>
                          <span className="font-medium">€{totaleCatalogo.toFixed(2)}</span>
                        </div>
                      )}
                      {customProducts.some(p => p.nome.trim()) && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-green-700">
                            Custom ({customProducts.filter(p => p.nome.trim()).length} prodotti)
                          </span>
                          <span className="font-medium">€{totaleCustom.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Totale */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Euro className="w-5 h-5 text-green-600" />
                      <span className="text-lg font-semibold">Totale Preventivo</span>
                    </div>
                    <div className="text-3xl font-bold text-green-600" data-testid="text-total-quote">
                      €{totale.toFixed(2)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Note interne */}
            <FormField
              control={form.control}
              name="noteInterne"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note Interne</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Note visibili solo in admin..."
                      rows={3}
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={createMutation.isPending}
                data-testid="button-cancel"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-sage hover:bg-dark-sage"
                data-testid="button-submit"
              >
                {createMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Crea Preventivo
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
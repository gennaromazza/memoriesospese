
/**
 * QUOTE TEMPLATES MANAGER
 * Interfaccia admin per gestire template preventivi riutilizzabili
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { getAllQuoteTemplates, createQuoteTemplate } from '@/lib/quotes';
import { getAllProducts } from '@/lib/products';
import { getJobTypes } from '@/lib/job-types';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import CatalogProductSelector from './CatalogProductSelector';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Trash2,
  FileText,
  Edit2,
  Palette,
  Loader2,
  Euro,
  Percent,
  Tag,
  Package
} from 'lucide-react';
import type { QuoteProduct } from '@shared/quotes-types';

const templateSchema = z.object({
  nome: z.string().min(1, 'Nome richiesto'),
  jobType: z.string().min(1, 'Tipo lavoro richiesto'),
  type: z.enum(['fisso', 'variabile']),
  catalogProductIds: z.array(z.string()).default([]),
  customProducts: z.array(z.object({
    nome: z.string(),
    descrizione: z.string(),
    prezzo: z.number().min(0),
    numeroFoto: z.number().optional(),
    categoria: z.string().optional()
  })),
  discountType: z.enum(['amount', 'percent']).optional(),
  discountValue: z.number().min(0).optional(),
  theme: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    footerText: z.string().optional()
  }),
  attivo: z.boolean().default(true)
});

type FormData = z.infer<typeof templateSchema>;

export default function QuoteTemplatesManager() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [createModalOpen, setCreateModalOpen] = useState(false);

  // Query templates
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['quote-templates'],
    queryFn: getAllQuoteTemplates
  });

  // Query job types
  const { data: jobTypes = [] } = useQuery({
    queryKey: ['job-types'],
    queryFn: getJobTypes
  });

  // Query catalog products
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getAllProducts
  });

  // Form
  const form = useForm<FormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      nome: '',
      jobType: '',
      type: 'fisso',
      catalogProductIds: [],
      customProducts: [{
        nome: '',
        descrizione: '',
        prezzo: 0,
        numeroFoto: 0,
        categoria: ''
      }],
      theme: {
        primaryColor: '#8B9A8B',
        secondaryColor: '#C8B8A8',
        footerText: 'Image Studio - Fotografia professionale'
      },
      attivo: true
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'customProducts'
  });

  // Watch values for totals
  const catalogProductIds = form.watch('catalogProductIds') || [];
  const customProducts = form.watch('customProducts') || [];
  const discountType = form.watch('discountType');
  const discountValue = form.watch('discountValue') || 0;

  // Calculate totals
  const totaleCatalogo = catalogProductIds.reduce((sum, id) => {
    const product = catalogProducts.find(p => p.id === id);
    return sum + (product?.prezzoFinale || product?.prezzo || 0);
  }, 0);

  const totaleCustom = customProducts
    .filter(p => p.nome?.trim())
    .reduce((sum, p) => sum + (p.prezzo || 0), 0);

  const subtotale = totaleCatalogo + totaleCustom;

  const totalAfterDiscount = discountType === 'amount'
    ? Math.max(0, subtotale - discountValue)
    : discountType === 'percent'
    ? subtotale * (1 - discountValue / 100)
    : subtotale;

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Merge catalog + custom products
      const catalogQuoteProducts: QuoteProduct[] = data.catalogProductIds.map(id => {
        const product = catalogProducts.find(p => p.id === id);
        if (!product) throw new Error(`Prodotto ${id} non trovato`);
        return {
          productId: product.id,
          nome: product.nome,
          descrizione: product.descrizione,
          prezzo: product.prezzoFinale || product.prezzo,
          selectable: data.type === 'variabile',
          numeroFoto: product.numeroFoto,
          categoria: product.categoria,
          immagini: product.immagini || []
        };
      });

      const customQuoteProducts: QuoteProduct[] = data.customProducts
        .filter(p => p.nome.trim())
        .map(p => ({
          nome: p.nome,
          descrizione: p.descrizione,
          prezzo: p.prezzo,
          selectable: data.type === 'variabile',
          numeroFoto: p.numeroFoto,
          categoria: p.categoria
        }));

      const allProducts = [...catalogQuoteProducts, ...customQuoteProducts];

      // Clausole di default (vuote per ora, possono essere personalizzate dopo)
      const defaultClauses = [
        {
          text: 'Il cliente accetta i termini e condizioni del servizio',
          required: true,
          ordine: 1
        }
      ];

      const templateData = {
        nome: data.nome,
        jobType: data.jobType as any,
        type: data.type,
        theme: data.theme,
        defaultProducts: allProducts,
        defaultClauses,
        attivo: data.attivo
      };

      return createQuoteTemplate(templateData, user!.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
      toast({
        title: 'Template creato!',
        description: 'Il template è ora disponibile per creare preventivi'
      });
      form.reset();
      setCreateModalOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const onSubmit = (data: FormData) => {
    createMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-sage" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Template Preventivi</h2>
          <p className="text-muted-foreground">
            Crea template riutilizzabili per preventivi ricorrenti
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} className="bg-sage hover:bg-dark-sage">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Template
        </Button>
      </div>

      {/* Templates Grid */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              Nessun template creato
            </p>
            <Button onClick={() => setCreateModalOpen(true)} className="bg-sage hover:bg-dark-sage">
              <Plus className="h-4 w-4 mr-2" />
              Crea il primo template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {templates.map(template => {
            const jobType = jobTypes.find(jt => jt.slug === template.jobType);
            const totale = template.defaultProducts.reduce((sum, p) => sum + p.prezzo, 0);
            
            return (
              <Card key={template.id} className={!template.attivo ? 'opacity-60' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        {jobType && <span>{jobType.icona}</span>}
                        {template.nome}
                      </CardTitle>
                      <CardDescription>
                        {jobType?.nome || template.jobType}
                      </CardDescription>
                    </div>
                    {!template.attivo && (
                      <Badge variant="secondary">Disattivo</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tipo:</span>
                    <Badge variant="outline">
                      {template.type === 'fisso' ? 'Fisso' : 'Variabile'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Prodotti:</span>
                    <span className="font-medium">
                      {template.defaultProducts.length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">Totale:</span>
                    <span className="text-lg font-bold text-sage">
                      €{totale.toLocaleString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Crea Template Preventivo
            </DialogTitle>
            <DialogDescription>
              Crea un template riutilizzabile con prodotti e prezzi preimpostati
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                {/* Nome Template */}
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Template *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="es. Comunioni 2025"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Tipo Lavoro */}
                <FormField
                  control={form.control}
                  name="jobType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo Lavoro *</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona tipo..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {jobTypes.map(jt => (
                            <SelectItem key={jt.id} value={jt.slug}>
                              <span className="flex items-center gap-2">
                                {jt.icona} {jt.nome}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Tipo Preventivo */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo Preventivo *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="fisso">Fisso (prezzo totale)</SelectItem>
                        <SelectItem value="variabile">Variabile (cliente sceglie)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Prodotti Catalogo */}
              <div>
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Prodotti dal Catalogo
                </h3>
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

              {/* Prodotti Custom */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Prodotti Custom (opzionale)</h3>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => append({
                      nome: '',
                      descrizione: '',
                      prezzo: 0,
                      numeroFoto: 0,
                      categoria: ''
                    })}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Aggiungi Prodotto
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
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={form.control}
                              name={`customProducts.${index}.nome`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Nome</FormLabel>
                                  <FormControl>
                                    <Input placeholder="es. Album 30x30" {...field} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name={`customProducts.${index}.prezzo`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Prezzo €</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder="0"
                                      {...field}
                                      onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={form.control}
                            name={`customProducts.${index}.descrizione`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Descrizione</FormLabel>
                                <FormControl>
                                  <Textarea
                                    placeholder="Descrizione prodotto..."
                                    rows={2}
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Sconto */}
              <Card className="bg-orange-50 border-orange-200">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Tag className="w-4 h-4" />
                    Sconto/Promozione (Opzionale)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="discountType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo Sconto</FormLabel>
                        <Select value={field.value || 'none'} onValueChange={(val) => field.onChange(val === 'none' ? undefined : val)}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">Nessuno sconto</SelectItem>
                            <SelectItem value="amount">
                              <div className="flex items-center gap-2">
                                <Euro className="w-4 h-4" />
                                <span>Sconto Fisso (€)</span>
                              </div>
                            </SelectItem>
                            <SelectItem value="percent">
                              <div className="flex items-center gap-2">
                                <Percent className="w-4 h-4" />
                                <span>Sconto Percentuale (%)</span>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {discountType && (
                    <FormField
                      control={form.control}
                      name="discountValue"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Valore Sconto {discountType === 'amount' ? '(€)' : '(%)'}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={discountType === 'amount' ? '0.00' : '0'}
                              {...field}
                              value={field.value || ''}
                              onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>

              {/* Riepilogo Totale */}
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-700">Subtotale</span>
                      <span className="font-medium">€{subtotale.toFixed(2)}</span>
                    </div>
                    
                    {discountType && discountValue > 0 && (
                      <div className="flex items-center justify-between text-sm text-orange-600">
                        <span>
                          Sconto {discountType === 'percent' ? `(${discountValue}%)` : ''}
                        </span>
                        <span>
                          -€{discountType === 'amount' ? discountValue.toFixed(2) : (subtotale * discountValue / 100).toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-green-200">
                      <span className="text-lg font-semibold">Totale Template</span>
                      <span className="text-3xl font-bold text-green-600">
                        €{totalAfterDiscount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Attivo */}
              <FormField
                control={form.control}
                name="attivo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between space-y-0">
                    <div>
                      <FormLabel>Template Attivo</FormLabel>
                      <FormDescription>
                        I template attivi sono disponibili per creare preventivi
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createMutation.isPending}
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-sage hover:bg-dark-sage"
                >
                  {createMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Crea Template
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

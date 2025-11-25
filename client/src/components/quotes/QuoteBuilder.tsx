/**
 * QUOTE BUILDER
 * Interfaccia admin per creare preventivi personalizzati
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { createQuote, getAllQuoteTemplates } from '@/lib/quotes';
import { getAllProducts } from '@/lib/products';
import { getAllClauseTemplates } from '@/lib/contract-clauses';
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
  Euro,
  Percent,
  Tag,
  Upload,
  X,
  Image as ImageIcon,
  CreditCard,
  Eye,
  Package
} from 'lucide-react';
import type { QuoteType, QuoteProduct } from '@shared/quotes-types';
import type { JobType as JobTypeSlug, Job } from '@shared/jobs-types';
import type { JobType } from '@shared/job-types';
import { DEFAULT_CLAUSES } from '@shared/contract-clause-types';
import { calculateQuoteTotals } from '@shared/quote-utils';
import { calculatePaymentSchedule, validatePaymentScheduleConfig, formatDueDate, formatCurrency } from '@shared/payment-schedule-utils';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getJob } from '@/lib/jobs';
import placeholderUrl from '@assets/generated_images/Custom_product_placeholder_image_f076e89e.png';

const quoteSchema = z.object({
  jobId: z.string().min(1),
  clienteId: z.string().min(1),
  type: z.enum(['fisso', 'variabile']),
  templateId: z.string().optional(),
  catalogProductIds: z.array(z.string()).default([]),
  products: z.array(z.object({
    nome: z.string(),
    descrizione: z.string(),
    prezzo: z.number().min(0),
    selectable: z.boolean(),
    numeroFoto: z.number().optional(),
    categoria: z.string().optional(),
    immagini: z.array(z.string()).optional()
  })),
  discountType: z.enum(['amount', 'percent']).optional(),
  discountValue: z.number().min(0).optional(),
  theme: z.object({
    primaryColor: z.string(),
    secondaryColor: z.string(),
    footerText: z.string().optional()
  }).optional(),
  expiresAt: z.date().optional(),
  noteInterne: z.string().optional(),
  paymentScheduleConfig: z.object({
    autoGenerate: z.boolean(),
    numberOfPayments: z.number().min(1).max(10).optional(),
    accontoType: z.enum(['percentage', 'amount']),
    accontoPercentage: z.number().min(0).max(100).optional(),
    accontoAmount: z.number().min(0).optional(),
    useEventDateReference: z.boolean(),
    accontoRelativeDays: z.number().optional(),
    rateIntervalDays: z.number().min(1).optional()
  }).optional(),
  clauseTemplateId: z.string().optional()
}).refine(
  (data) => {
    // Valida che ci sia almeno un prodotto (catalogo o custom compilato)
    const hasValidCustomProducts = data.products.some(p => p.nome.trim() && p.prezzo > 0);
    return data.catalogProductIds.length > 0 || hasValidCustomProducts;
  },
  { message: 'Aggiungi almeno un prodotto (catalogo o custom)', path: ['products'] }
).refine(
  (data) => {
    // Valida prodotti custom: se nome è compilato, deve avere anche prezzo > 0
    const invalidProducts = data.products.filter(p => {
      const hasName = p.nome.trim();
      const hasPrice = p.prezzo > 0;
      return (hasName && !hasPrice) || (!hasName && hasPrice);
    });
    return invalidProducts.length === 0;
  },
  { message: 'Prodotti custom: se compili il nome, devi inserire anche un prezzo > 0', path: ['products'] }
);

type FormData = z.infer<typeof quoteSchema>;

interface QuoteBuilderProps {
  jobId: string;
  clienteId: string;
  jobType: JobType;
  jobTypeSlug: JobTypeSlug;
  open: boolean;
  onClose: () => void;
  editQuoteId?: string; // ID del preventivo da modificare (opzionale)
}

export default function QuoteBuilder({
  jobId,
  clienteId,
  jobType,
  jobTypeSlug,
  open,
  onClose,
  editQuoteId
}: QuoteBuilderProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedClauseTemplateId, setSelectedClauseTemplateId] = useState<string>('');
  const [uploadingImages, setUploadingImages] = useState<{ [key: number]: boolean }>({});

  // Query job per eventDate
  const { data: job } = useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => getJob(jobId),
    enabled: !!jobId
  });

  // Query preventivo esistente se in modalità edit
  const { data: existingQuote } = useQuery({
    queryKey: ['quotes', editQuoteId],
    queryFn: async () => {
      if (!editQuoteId) return null;
      const { doc, getDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const { collection } = await import('firebase/firestore');
      const quoteRef = doc(collection(db, 'quotes'), editQuoteId);
      const snapshot = await getDoc(quoteRef);
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as any;
    },
    enabled: !!editQuoteId && open
  });

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

  // Query contract clause templates
  const { data: allClauseTemplates = [], isLoading: isLoadingClauses } = useQuery({
    queryKey: ['contract-clause-templates'],
    queryFn: getAllClauseTemplates
  });

  // Filtro templates per tipo job usando lo slug
  const filteredTemplates = templates.filter(t => t.jobType === jobType.slug && t.attivo);
  
  // Filtro contract clause templates per jobType e attivi
  const clauseTemplates = allClauseTemplates.filter(t => t.jobType === jobTypeSlug && t.attivo);

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
      noteInterne: '',
      paymentScheduleConfig: {
        autoGenerate: false,
        numberOfPayments: 2,
        accontoType: 'percentage',
        accontoPercentage: 30,
        accontoAmount: 0,
        useEventDateReference: true,
        accontoRelativeDays: -30,
        rateIntervalDays: 30
      }
    }
  });

  // Reset state quando dialog si chiude o jobType cambia
  useEffect(() => {
    if (!open) {
      setSelectedClauseTemplateId('');
      form.setValue('clauseTemplateId', '');
    }
  }, [open, form]);

  useEffect(() => {
    setSelectedClauseTemplateId('');
    form.setValue('clauseTemplateId', '');
  }, [jobTypeSlug, form]);

  // Auto-select template predefinito per le clausole (dopo form init)
  useEffect(() => {
    if (clauseTemplates.length > 0 && !selectedClauseTemplateId) {
      const defaultTemplate = clauseTemplates.find(t => t.predefinito);
      if (defaultTemplate) {
        setSelectedClauseTemplateId(defaultTemplate.id);
        form.setValue('clauseTemplateId', defaultTemplate.id);
      }
    }
  }, [clauseTemplates, selectedClauseTemplateId, form]);

  // Carica dati preventivo esistente nel form quando disponibile
  useEffect(() => {
    if (!existingQuote || !editQuoteId) return;

    // Separa prodotti catalogo da custom
    const catalogIds: string[] = [];
    const customProducts: any[] = [];

    existingQuote.products?.forEach((product: any) => {
      if (product.catalogProductId) {
        catalogIds.push(product.catalogProductId);
      } else {
        customProducts.push({
          nome: product.nome || '',
          descrizione: product.descrizione || '',
          prezzo: product.prezzo || 0,
          selectable: product.selectable || false,
          numeroFoto: product.numeroFoto || 0,
          categoria: product.categoria || '',
          immagini: product.immagini || []
        });
      }
    });

    // Popola form
    form.setValue('type', existingQuote.type || 'fisso');
    form.setValue('catalogProductIds', catalogIds);
    form.setValue('products', customProducts.length > 0 ? customProducts : [{
      nome: '',
      descrizione: '',
      prezzo: 0,
      selectable: false,
      numeroFoto: 0,
      categoria: '',
      immagini: []
    }]);
    
    if (existingQuote.discountType) {
      form.setValue('discountType', existingQuote.discountType);
      form.setValue('discountValue', existingQuote.discountValue || 0);
    }

    if (existingQuote.theme) {
      form.setValue('theme', existingQuote.theme);
    }

    if (existingQuote.expiresAt) {
      const expiryDate = existingQuote.expiresAt?.toDate ? existingQuote.expiresAt.toDate() : new Date(existingQuote.expiresAt);
      form.setValue('expiresAt', expiryDate);
    }

    if (existingQuote.noteInterne) {
      form.setValue('noteInterne', existingQuote.noteInterne);
    }

    if (existingQuote.paymentScheduleConfig) {
      form.setValue('paymentScheduleConfig', existingQuote.paymentScheduleConfig);
    }

    if (existingQuote.clauseTemplateId) {
      setSelectedClauseTemplateId(existingQuote.clauseTemplateId);
      form.setValue('clauseTemplateId', existingQuote.clauseTemplateId);
    }

    toast({
      title: 'Preventivo caricato',
      description: 'Modifica i campi e salva per aggiornare'
    });
  }, [existingQuote, editQuoteId, form, toast]);

  // Handler cambio template clausole
  const handleClauseTemplateChange = (templateId: string) => {
    setSelectedClauseTemplateId(templateId);
    form.setValue('clauseTemplateId', templateId);
  };

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'products'
  });

  // Watch form values for totals
  const catalogProductIds = form.watch('catalogProductIds') || [];
  const customProducts = form.watch('products') || [];
  const discountType = form.watch('discountType');
  const discountValue = form.watch('discountValue') || 0;
  const quoteType = form.watch('type');

  // Watch payment schedule config for simulator
  const paymentConfig = form.watch('paymentScheduleConfig');
  const autoGenerate = paymentConfig?.autoGenerate || false;

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

  const subtotale = totaleCatalogo + totaleCustom;

  // Calcola totali con sconto usando utility condivisa
  const { totalBeforeDiscount, discountAmount, totalAfterDiscount } = useMemo(() => {
    return calculateQuoteTotals(subtotale, discountType, discountValue);
  }, [subtotale, discountType, discountValue]);

  // Validazione + simulazione piano pagamenti real-time
  const paymentSchedulePreview = useMemo(() => {
    if (!autoGenerate || !paymentConfig || totalAfterDiscount === 0) return null;

    // Valida config prima di calcolare
    const validation = validatePaymentScheduleConfig(paymentConfig, totalAfterDiscount);
    if (!validation.valid) {
      console.warn('Configurazione pagamenti non valida:', validation.error);
      return null;
    }

    // Converti eventDate da Timestamp a Date
    const eventDate = job?.eventDate ? 
      (job.eventDate instanceof Date ? job.eventDate : (job.eventDate as any).toDate?.() || null) 
      : null;

    try {
      return calculatePaymentSchedule(totalAfterDiscount, paymentConfig, eventDate || undefined);
    } catch (error) {
      console.error('Errore calcolo preview pagamenti:', error);
      return null;
    }
  }, [autoGenerate, paymentConfig, totalAfterDiscount, job?.eventDate]);

  // Validazione errori per alert inline
  const paymentConfigValidation = useMemo(() => {
    if (!autoGenerate || !paymentConfig || totalAfterDiscount === 0) return { valid: true };
    return validatePaymentScheduleConfig(paymentConfig, totalAfterDiscount);
  }, [autoGenerate, paymentConfig, totalAfterDiscount]);

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
    
    // Carica anche lo sconto dal template
    if ((template as any).discountType) {
      form.setValue('discountType', (template as any).discountType);
      form.setValue('discountValue', (template as any).discountValue || 0);
    } else {
      form.setValue('discountType', undefined);
      form.setValue('discountValue', undefined);
    }
  };

  // Upload immagine prodotto custom
  const handleImageUpload = async (file: File, productIndex: number) => {
    try {
      setUploadingImages(prev => ({ ...prev, [productIndex]: true }));

      // Upload su Firebase Storage
      const storageRef = ref(storage, `quote-products/${nanoid()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      // Aggiorna form
      const currentImages = form.getValues(`products.${productIndex}.immagini`) || [];
      form.setValue(`products.${productIndex}.immagini`, [...currentImages, downloadURL]);

      toast({
        title: 'Immagine caricata',
        description: 'L\'immagine è stata aggiunta al prodotto'
      });
    } catch (error) {
      console.error('Errore upload immagine:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare l\'immagine',
        variant: 'destructive'
      });
    } finally {
      setUploadingImages(prev => ({ ...prev, [productIndex]: false }));
    }
  };

  // Rimuovi immagine
  const handleRemoveImage = (productIndex: number, imageIndex: number) => {
    const currentImages = form.getValues(`products.${productIndex}.immagini`) || [];
    const newImages = currentImages.filter((_, idx) => idx !== imageIndex);
    form.setValue(`products.${productIndex}.immagini`, newImages);
  };

  // Mutation crea/aggiorna preventivo
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Se stiamo modificando un preventivo esistente
      if (editQuoteId) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const { collection, Timestamp } = await import('firebase/firestore');

        // Merge catalog + custom products
        const mergedProducts = mergeQuoteProducts(
          data.catalogProductIds,
          data.products.filter(p => p.nome.trim()),
          catalogProducts,
          data.type
        );

        const subtotale = mergedProducts.reduce((sum, p) => sum + p.prezzo, 0);
        const finalTotals = calculateQuoteTotals(subtotale, data.discountType, data.discountValue);

        const updateData: any = {
          type: data.type,
          products: mergedProducts,
          discountType: data.discountType,
          discountValue: data.discountValue,
          totalBeforeDiscount: finalTotals.totalBeforeDiscount,
          totalAfterDiscount: finalTotals.totalAfterDiscount,
          theme: data.theme,
          expiresAt: data.expiresAt ? Timestamp.fromDate(data.expiresAt) : null,
          noteInterne: data.noteInterne,
          paymentScheduleConfig: data.paymentScheduleConfig,
          updatedAt: Timestamp.now()
        };

        const quoteRef = doc(collection(db, 'quotes'), editQuoteId);
        await updateDoc(quoteRef, updateData);
        return editQuoteId;
      }

      // Altrimenti crea nuovo preventivo (logica esistente)
      // Merge catalog + custom products
      const mergedProducts = mergeQuoteProducts(
        data.catalogProductIds,
        data.products.filter(p => p.nome.trim()), // Solo custom con nome
        catalogProducts,
        data.type
      );

      // Prepara clausole: priorità template Firestore → fallback DEFAULT_CLAUSES
      let contractClauses;
      let usedTemplateId;
      
      if (selectedClauseTemplateId) {
        const selectedTemplate = clauseTemplates.find(t => t.id === selectedClauseTemplateId);
        if (selectedTemplate) {
          // Usa clausole dal template Firestore
          contractClauses = selectedTemplate.clauses.map(c => ({
            id: nanoid(),
            text: c.text,
            required: c.required,
            ordine: c.ordine
          }));
          usedTemplateId = selectedClauseTemplateId;
        } else {
          // Template ID fornito ma non trovato - ERROR critico
          throw new Error(`Template clausole con ID "${selectedClauseTemplateId}" non trovato. Riprova o seleziona un altro template.`);
        }
      }
      
      // Fallback a DEFAULT_CLAUSES se nessun template selezionato
      if (!contractClauses) {
        const clauses = DEFAULT_CLAUSES[jobTypeSlug] || [];
        contractClauses = clauses.map(c => ({
          id: nanoid(),
          text: c.text,
          required: c.required,
          ordine: c.ordine
        }));
        
        // Info toast solo se query completata E ci sono template disponibili ma non selezionati
        if (!isLoadingClauses && clauseTemplates.length > 0) {
          toast({
            title: 'Clausole di default',
            description: 'Nessun template clausole selezionato. Uso clausole predefinite hardcoded.',
            variant: 'default'
          });
        }
      }

      // Calcola totali finali con sconto
      const subtotale = mergedProducts.reduce((sum, p) => sum + p.prezzo, 0);
      const finalTotals = calculateQuoteTotals(subtotale, data.discountType, data.discountValue);

      // Prepara jobInfo e clientiInfo per il portale firmato
      const jobInfo = job ? {
        nomeEvento: job.nomeEvento,
        eventDate: job.eventDate,
        rito: job.rituLocation || '',
        location: job.eventLocation || ''
      } : undefined;

      // Fetch clienti completi da Firestore per includere tutti i dati
      const clientiInfo = [];
      if (job?.clientiIds && job.clientiIds.length > 0) {
        const { getClienteById } = await import('@/lib/clienti');
        for (const clienteId of job.clientiIds) {
          try {
            const cliente = await getClienteById(clienteId);
            if (cliente) {
              clientiInfo.push({
                id: cliente.id,
                nome: cliente.nome,
                cognome: cliente.cognome,
                email: cliente.email,
                telefono: cliente.cellulare1 || cliente.cellulare2 || '',
                indirizzo: cliente.via || '',
                cap: cliente.cap || '',
                citta: cliente.citta || ''
              });
            }
          } catch (error) {
            console.warn(`Impossibile caricare cliente ${clienteId}:`, error);
          }
        }
      }

      const quoteData = {
        jobId: data.jobId,
        clienteId: data.clienteId,
        type: data.type,
        products: mergedProducts,
        discountType: data.discountType,
        discountValue: data.discountValue,
        totalBeforeDiscount: finalTotals.totalBeforeDiscount,
        totalAfterDiscount: finalTotals.totalAfterDiscount,
        theme: data.theme,
        expiresAt: data.expiresAt,
        noteInterne: data.noteInterne,
        paymentScheduleConfig: data.paymentScheduleConfig,
        templateId: selectedTemplateId || undefined,
        ...(usedTemplateId && { clauseTemplateId: usedTemplateId }),
        contractClauses,
        ...(jobInfo && { jobInfo }),
        ...(clientiInfo.length > 0 && { clientiInfo })
      };

      return createQuote(quoteData, user!.uid);
    },
    onSuccess: async (quoteId: string) => {
      queryClient.invalidateQueries({ queryKey: ['quotes', 'job', jobId] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      if (editQuoteId) {
        queryClient.invalidateQueries({ queryKey: ['quotes', editQuoteId] });
      }
      
      toast({
        title: editQuoteId ? 'Preventivo aggiornato!' : 'Preventivo creato!',
        description: editQuoteId 
          ? 'Le modifiche sono state salvate correttamente.' 
          : 'Il preventivo è stato salvato. Potrai inviarlo manualmente dalla pagina del lavoro.'
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
      {/* FIX: Rimuovere overflow dal DialogContent perché blocca i click sui Select/Popover
           e spostare lo scroll in un wrapper interno */}
      <DialogContent className="w-[98vw] sm:max-w-4xl p-0">
        
        {/* Wrapper scrollabile */}
        <div className="max-h-[90vh] overflow-y-auto px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{jobType.icona}</span>
              <FileText className="w-5 h-5" />
              {editQuoteId ? 'Modifica Preventivo' : 'Crea Preventivo'}
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
                <CardContent className="space-y-3">
                  <Select value={selectedTemplateId} onValueChange={handleLoadTemplate}>
                    <SelectTrigger data-testid="select-template">
                      <SelectValue placeholder="Seleziona template..." />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                      {filteredTemplates.map(template => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.nome} ({template.type})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Anteprima Template Selezionato */}
                  {selectedTemplateId && (() => {
                    const selectedTemplate = filteredTemplates.find(t => t.id === selectedTemplateId);
                    if (!selectedTemplate) return null;
                    
                    const templateDiscount = (selectedTemplate as any).discountType;
                    const templateDiscountValue = (selectedTemplate as any).discountValue || 0;
                    const productCount = selectedTemplate.defaultProducts?.length || 0;
                    const templateTotal = selectedTemplate.defaultProducts?.reduce((sum, p) => sum + (p.prezzo || 0), 0) || 0;
                    
                    // Calcola prezzo finale scontato
                    let finalPrice = templateTotal;
                    if (templateDiscount === 'amount') {
                      finalPrice = Math.max(0, templateTotal - templateDiscountValue);
                    } else if (templateDiscount === 'percent') {
                      finalPrice = templateTotal * (1 - templateDiscountValue / 100);
                    }
                    
                    return (
                      <div className="bg-white rounded-lg border p-3 space-y-2 text-sm">
                        <div className="font-medium text-blue-800 flex items-center gap-2">
                          <Eye className="w-4 h-4" />
                          Anteprima Template
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Package className="w-3.5 h-3.5" />
                            <span>{productCount} prodotti</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Euro className="w-3.5 h-3.5" />
                            <span className={templateDiscount ? 'line-through' : ''}>
                              €{templateTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        
                        {templateDiscount && (
                          <>
                            <div className="flex items-center gap-1 text-orange-600">
                              <Tag className="w-3.5 h-3.5" />
                              <span>
                                Sconto: {templateDiscount === 'percent' 
                                  ? `${templateDiscountValue}%` 
                                  : `€${templateDiscountValue.toFixed(2)}`}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-green-600 font-semibold">
                              <Euro className="w-3.5 h-3.5" />
                              <span>Prezzo Finale: €{finalPrice.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        
                        {productCount > 0 && (
                          <div className="pt-2 border-t">
                            <div className="text-xs text-muted-foreground mb-1">Prodotti inclusi ({productCount}):</div>
                            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                              {selectedTemplate.defaultProducts?.map((p, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {p.nome} - €{(p.prezzo || 0).toFixed(0)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
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
                      <SelectContent position="popper" sideOffset={4} className="z-[9999]">
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

              {/* Template Clausole Contrattuali */}
              <FormItem>
                <FormLabel>Template Clausole Contrattuali</FormLabel>
                <Select 
                  value={selectedClauseTemplateId || 'default'} 
                  onValueChange={(val) => val !== 'default' && handleClauseTemplateChange(val)}
                  data-testid="select-clause-template"
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona template..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                    {!isLoadingClauses && clauseTemplates.length === 0 && (
                      <SelectItem value="default">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">DEFAULT</Badge>
                          <span>Clausole hardcoded</span>
                        </div>
                      </SelectItem>
                    )}
                    {clauseTemplates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          {template.predefinito && <Badge variant="default">PREDEFINITO</Badge>}
                          <span>{template.titolo}</span>
                          <span className="text-xs text-muted-foreground">
                            ({template.clauses.length} clausole)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {clauseTemplates.length > 0 
                    ? 'Template clausole gestito in Admin Dashboard'
                    : 'Nessun template disponibile - uso clausole di default'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            </div>

            <div className="grid grid-cols-2 gap-4">
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

                        {/* Upload Immagine Prodotto */}
                        <FormField
                          control={form.control}
                          name={`products.${index}.immagini`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <ImageIcon className="w-4 h-4" />
                                Immagine Prodotto (opzionale)
                              </FormLabel>
                              <FormControl>
                                <div className="space-y-3">
                                  {/* Preview immagini caricate */}
                                  {field.value && field.value.length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                      {field.value.map((url, imgIndex) => (
                                        <div key={imgIndex} className="relative group">
                                          <img
                                            src={url}
                                            alt={`Prodotto ${index + 1} - Immagine ${imgIndex + 1}`}
                                            className="w-full h-24 object-cover rounded-md border"
                                          />
                                          <Button
                                            type="button"
                                            size="icon"
                                            variant="destructive"
                                            className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={() => handleRemoveImage(index, imgIndex)}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="border-2 border-dashed rounded-md p-4 text-center">
                                      <img
                                        src={placeholderUrl}
                                        alt="Placeholder"
                                        className="w-32 h-24 mx-auto object-cover rounded-md mb-2"
                                      />
                                      <p className="text-xs text-muted-foreground">
                                        Nessuna immagine caricata
                                      </p>
                                    </div>
                                  )}

                                  {/* Upload button */}
                                  <div>
                                    <Input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      id={`upload-${index}`}
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleImageUpload(file, index);
                                      }}
                                      data-testid={`input-upload-image-${index}`}
                                    />
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      disabled={uploadingImages[index]}
                                      onClick={() => document.getElementById(`upload-${index}`)?.click()}
                                      data-testid={`button-upload-image-${index}`}
                                    >
                                      {uploadingImages[index] ? (
                                        <>
                                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                          Caricamento...
                                        </>
                                      ) : (
                                        <>
                                          <Upload className="w-4 h-4 mr-2" />
                                          Carica Immagine
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              </FormControl>
                              <FormDescription>
                                Aggiungi un'immagine rappresentativa del prodotto (max 5MB)
                              </FormDescription>
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

            <Separator />

            {/* Sconto Finale */}
            <Card className="bg-orange-50 border-orange-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  Sconto Finale (Opzionale)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Tipo Sconto */}
                <FormField
                  control={form.control}
                  name="discountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo Sconto</FormLabel>
                      <Select value={field.value || 'none'} onValueChange={(val) => field.onChange(val === 'none' ? undefined : val)}>
                        <FormControl>
                          <SelectTrigger data-testid="select-discount-type">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper" sideOffset={4} className="z-[9999]">
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

                {/* Valore Sconto (solo se tipo è selezionato) */}
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
                            max={discountType === 'percent' ? '100' : undefined}
                            placeholder={discountType === 'amount' ? '0.00' : '0'}
                            {...field}
                            value={field.value || ''}
                            onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-discount-value"
                          />
                        </FormControl>
                        <FormDescription>
                          {discountType === 'amount' 
                            ? `Max: €${subtotale.toFixed(2)}`
                            : 'Max: 100%'
                          }
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <Separator />

            {/* Configurazione Piano Pagamenti Avanzata - SOLO per moduli FISSI */}
            {quoteType === 'fisso' && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Piano Pagamenti (Opzionale)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="paymentScheduleConfig.autoGenerate"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between space-y-0">
                      <div className="space-y-1">
                        <FormLabel>Genera automaticamente alla firma</FormLabel>
                        <FormDescription>
                          Crea piano pagamenti quando il cliente firma il preventivo
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-auto-payment"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {autoGenerate && (
                  <>
                    {/* Alert validazione inline */}
                    {!paymentConfigValidation.valid && (
                      <div className="flex items-start gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        <span className="text-orange-600 text-sm font-medium">
                          ⚠️ {paymentConfigValidation.error}
                        </span>
                      </div>
                    )}

                    {/* Numero Rate */}
                    <FormField
                      control={form.control}
                      name="paymentScheduleConfig.numberOfPayments"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Numero Rate Totali</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="es. 3"
                              min={1}
                              max={10}
                              {...field}
                              onChange={e => field.onChange(parseInt(e.target.value) || 2)}
                              data-testid="input-num-payments"
                            />
                          </FormControl>
                          <FormDescription>
                            Totale rate incluso acconto (min 1, max 10)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Dual-Mode Acconto */}
                    <div className="space-y-3">
                      <FormField
                        control={form.control}
                        name="paymentScheduleConfig.accontoType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Tipo Acconto</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange}>
                              <FormControl>
                                <SelectTrigger data-testid="select-acconto-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                                <SelectItem value="percentage">Percentuale (%)</SelectItem>
                                <SelectItem value="amount">Importo Fisso (€)</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {paymentConfig?.accontoType === 'percentage' ? (
                        <FormField
                          control={form.control}
                          name="paymentScheduleConfig.accontoPercentage"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Percentuale Acconto</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="es. 30"
                                  min={0}
                                  max={100}
                                  {...field}
                                  onChange={e => field.onChange(parseInt(e.target.value) || 30)}
                                  data-testid="input-acconto-percent"
                                />
                              </FormControl>
                              <FormDescription>
                                Percentuale acconto iniziale (0-100%)
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={form.control}
                          name="paymentScheduleConfig.accontoAmount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Importo Acconto</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="es. 500"
                                  min={0}
                                  max={totalAfterDiscount}
                                  {...field}
                                  onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid="input-acconto-amount"
                                />
                              </FormControl>
                              <FormDescription>
                                Importo acconto fisso in € (max: {formatCurrency(totalAfterDiscount)})
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {/* Riferimento Data */}
                    <FormField
                      control={form.control}
                      name="paymentScheduleConfig.useEventDateReference"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between space-y-0">
                          <div className="space-y-1">
                            <FormLabel>Usa Data Evento come Riferimento</FormLabel>
                            <FormDescription>
                              Calcola scadenze relative alla data dell'evento
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                              data-testid="switch-event-reference"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    {paymentConfig?.useEventDateReference && (
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="paymentScheduleConfig.accontoRelativeDays"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Giorni Acconto da Evento</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="es. -30"
                                  {...field}
                                  onChange={e => field.onChange(parseInt(e.target.value) || -30)}
                                  data-testid="input-acconto-days"
                                />
                              </FormControl>
                              <FormDescription>
                                Negativo = giorni prima evento
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="paymentScheduleConfig.rateIntervalDays"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Intervallo tra Rate (gg)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="es. 30"
                                  min={1}
                                  {...field}
                                  onChange={e => field.onChange(parseInt(e.target.value) || 30)}
                                  data-testid="input-rate-interval"
                                />
                              </FormControl>
                              <FormDescription>
                                Giorni tra ogni rata
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}

                    {/* Simulatore Visivo */}
                    {paymentSchedulePreview && (
                      <div className="mt-6 bg-white border border-blue-300 rounded-lg p-4">
                        <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          Anteprima Piano Pagamenti
                          <Badge variant="outline" className="ml-auto" data-testid="badge-payments-count">
                            {paymentSchedulePreview.payments.length} rate
                          </Badge>
                        </h4>
                        <div className="space-y-2">
                          {paymentSchedulePreview.payments.map((payment, idx) => (
                            <div 
                              key={idx} 
                              className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded border"
                              data-testid={`preview-payment-${idx}`}
                            >
                              <div className="flex items-center gap-3">
                                <Badge 
                                  variant={payment.tipo === 'acconto' ? 'default' : payment.tipo === 'saldo' ? 'secondary' : 'outline'}
                                  className="capitalize"
                                >
                                  {payment.tipo}
                                </Badge>
                                <span className="text-sm text-gray-600">{payment.descrizione}</span>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold">{formatCurrency(payment.importo)}</div>
                                <div className="text-xs text-gray-500">{formatDueDate(payment.dataScadenza)}</div>
                                {payment.giorniDaEvento !== undefined && (
                                  <div className="text-xs text-blue-600">
                                    {payment.giorniDaEvento > 0 ? '+' : ''}{payment.giorniDaEvento} gg da evento
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                          <span className="text-sm font-medium">Totale Piano</span>
                          <span className="text-lg font-bold text-blue-700">
                            {formatCurrency(paymentSchedulePreview.totale)}
                          </span>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            )}

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
                      
                      {/* Subtotale */}
                      <div className="flex items-center justify-between text-sm font-semibold pt-2">
                        <span className="text-green-800">Subtotale</span>
                        <span>€{totalBeforeDiscount.toFixed(2)}</span>
                      </div>
                      
                      {/* Sconto applicato */}
                      {discountAmount > 0 && (
                        <div className="flex items-center justify-between text-sm text-orange-600">
                          <span>
                            Sconto {discountType === 'percent' ? `(${discountValue}%)` : ''}
                          </span>
                          <span>-€{discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Totale Finale */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Euro className="w-5 h-5 text-green-600" />
                      <span className="text-lg font-semibold">Totale Finale</span>
                    </div>
                    <div className="text-3xl font-bold text-green-600" data-testid="text-total-quote">
                      €{totalAfterDiscount.toFixed(2)}
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
                {editQuoteId ? 'Salva Modifiche' : 'Crea Preventivo'}
              </Button>
            </div>
          </form>
        </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
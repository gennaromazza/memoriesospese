/**
 * QUOTE BUILDER
 * Interfaccia admin per creare preventivi personalizzati
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
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
import { DateInput } from '@/components/ui/date-input';
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
  Package,
  GripVertical
} from 'lucide-react';
import { JobTypeIcon } from '@/lib/job-type-icons';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { QuoteType, QuoteProduct } from '@shared/quotes-types';
import type { JobType as JobTypeSlug, Job } from '@shared/jobs-types';
import type { JobType, JobTypeFE } from '@shared/job-types';
import { DEFAULT_CLAUSES } from '@shared/contract-clause-types';
import { calculateQuoteTotals, validateDiscount } from '@shared/quote-utils';
import { calculatePaymentSchedule, validatePaymentScheduleConfig, formatDueDate, formatCurrency } from '@shared/payment-schedule-utils';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';
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
    immagini: z.array(z.string()).optional(),
    isOmaggio: z.boolean().optional()
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
    const hasValidCustomProducts = data.products.some(p => p.nome.trim() && (p.prezzo > 0 || p.isOmaggio));
    return data.catalogProductIds.length > 0 || hasValidCustomProducts;
  },
  { message: 'Aggiungi almeno un prodotto (catalogo o custom)', path: ['products'] }
).refine(
  (data) => {
    // Valida prodotti custom: se nome è compilato, deve avere anche prezzo > 0 (a meno che sia omaggio)
    const invalidProducts = data.products.filter(p => {
      const hasName = p.nome.trim();
      const hasPrice = p.prezzo > 0;
      const isOmaggio = p.isOmaggio;
      if (isOmaggio) return false; // Gli omaggi sono sempre validi con solo il nome
      return (hasName && !hasPrice) || (!hasName && hasPrice);
    });
    return invalidProducts.length === 0;
  },
  { message: 'Prodotti custom: se compili il nome, devi inserire anche un prezzo > 0', path: ['products'] }
);

type FormData = z.infer<typeof quoteSchema>;

// Template prodotti frequenti per quick-add
const FREQUENT_PRODUCTS = [
  { nome: 'Album Matrimonio 30x30', descrizione: '30 facciate, copertina in pelle', prezzo: 450 },
  { nome: 'Album Matrimonio 35x35', descrizione: '40 facciate, copertina in pelle premium', prezzo: 650 },
  { nome: 'Album Genitori 20x20', descrizione: '20 facciate, copertina rigida', prezzo: 180 },
  { nome: 'Stampa Fine Art 30x40', descrizione: 'Stampa giclée su carta cotone', prezzo: 80 },
  { nome: 'Stampa Fine Art 50x70', descrizione: 'Stampa giclée su carta cotone', prezzo: 150 },
  { nome: 'Box USB Personalizzato', descrizione: 'Chiavetta USB in cofanetto legno', prezzo: 120 },
  { nome: 'Ingrandimento con Cornice', descrizione: 'Stampa 40x60 con cornice', prezzo: 220 },
  { nome: 'Secondo Fotografo', descrizione: '8 ore di servizio aggiuntivo', prezzo: 400 },
  { nome: 'Servizio Video Highlights', descrizione: 'Video 3-5 minuti highlight', prezzo: 800 },
  { nome: 'Servizio Droni', descrizione: 'Riprese aeree location', prezzo: 300 },
];

// Sortable Product Card component for drag and drop
interface SortableProductCardProps {
  id: string;
  index: number;
  isIncomplete: boolean;
  isEmpty: boolean;
  hasName: boolean;
  fieldsLength: number;
  onRemove: () => void;
  children: React.ReactNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
  productName: string;
  productPrice: number;
  isOmaggio?: boolean;
}

function SortableProductCard({
  id,
  index,
  isIncomplete,
  isEmpty,
  hasName,
  fieldsLength,
  onRemove,
  children,
  isExpanded,
  onToggleExpand,
  productName,
  productPrice,
  isOmaggio
}: SortableProductCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isIncomplete && "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
        isEmpty && "border-dashed border-muted-foreground/30",
        isDragging && "shadow-lg ring-2 ring-primary"
      )}
    >
      <CardContent className="pt-6">
        <div 
          className="flex justify-between items-start cursor-pointer"
          onClick={onToggleExpand}
        >
          <div className="flex items-center gap-2">
            {/* Drag Handle - accessible button */}
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
              aria-label={`Trascina per riordinare prodotto ${index + 1}`}
              data-testid={`drag-handle-product-${index}`}
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </button>
            <Badge variant={isIncomplete ? "destructive" : isEmpty ? "secondary" : "outline"}>
              Prodotto {index + 1}
            </Badge>
            {isOmaggio && !isExpanded && (
              <Badge className="bg-rose-100 text-rose-700 border-rose-300 text-xs">🎁 Omaggio</Badge>
            )}
            {!isExpanded && productName && (
              <span className="text-sm text-muted-foreground truncate max-w-[200px]">
                {productName}{!isOmaggio && ` - €${productPrice.toFixed(2)}`}
              </span>
            )}
            {isIncomplete && !isOmaggio && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                ⚠️ {!hasName ? 'Inserisci nome' : 'Inserisci prezzo'}
              </span>
            )}
            {!isEmpty && !isIncomplete && (
              <span className="text-xs text-green-600 dark:text-green-400">✓</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="h-8 w-8 p-0"
            >
              <svg
                className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </Button>
            {fieldsLength > 1 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                data-testid={`button-remove-product-${index}`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
        {isExpanded && (
          <div className="mt-4">
            {children}
            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand();
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
                data-testid={`button-confirm-product-${index}`}
              >
                ✓ Conferma prodotto
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface QuoteBuilderProps {
  jobId: string;
  clienteId: string;
  jobType: JobType | JobTypeFE;
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
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [frequentProductValue, setFrequentProductValue] = useState<string>('');
  const prevFieldsCountRef = useRef<number>(0);

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
    // Reset clausole quando cambia jobType per evitare salvataggio clausole sbagliate
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

    // Protezione struttura array per evitare crash se schema cambia
    if (Array.isArray(existingQuote.products)) {
      existingQuote.products.forEach((product: any) => {
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
    }

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

    setSelectedTemplateId(existingQuote.templateId ?? '');
    setExpandedProducts(new Set());
    setUploadingImages({});

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

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'products',
    shouldUnregister: false
  });

  // Auto-expand newly added custom products
  const pendingExpandRef = useRef(false);
  useEffect(() => {
    if (pendingExpandRef.current) {
      pendingExpandRef.current = false;
      const newField = fields[fields.length - 1];
      if (newField) {
        setExpandedProducts(prev => new Set([...prev, newField.id]));
      }
    }
    prevFieldsCountRef.current = fields.length;
  }, [fields]);

  const appendProduct = useCallback((data: Parameters<typeof append>[0]) => {
    pendingExpandRef.current = true;
    append(data);
  }, [append]);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end for reordering products
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const oldIndex = fields.findIndex((field) => field.id === active.id);
      const newIndex = fields.findIndex((field) => field.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        move(oldIndex, newIndex);
      }
    }
  };

  // Watch form values for totals
  const catalogProductIds = form.watch('catalogProductIds') || [];
  const customProducts = form.watch('products') || [];
  
  // Watch products for performance optimization in render loop
  const watchedProducts = useWatch({ control: form.control, name: 'products' });
  const discountType = form.watch('discountType');
  const discountValue = form.watch('discountValue') || 0;
  const quoteType = form.watch('type');

  // Aggiorna selectable su tutti i prodotti quando cambia il tipo preventivo
  useEffect(() => {
    const products = form.getValues('products');
    if (products && products.length > 0) {
      const shouldBeSelectable = quoteType === 'variabile';
      const needsUpdate = products.some(p => p.selectable !== shouldBeSelectable);
      if (needsUpdate) {
        const updatedProducts = products.map(p => ({
          ...p,
          selectable: shouldBeSelectable
        }));
        form.setValue('products', updatedProducts, { shouldDirty: true, shouldTouch: false, shouldValidate: false });
      }
    }
  }, [quoteType, form]);

  // Watch payment schedule config for simulator - watch individual fields to ensure updates
  const paymentConfigAutoGenerate = form.watch('paymentScheduleConfig.autoGenerate');
  const paymentConfigNumberOfPayments = form.watch('paymentScheduleConfig.numberOfPayments');
  const paymentConfigAccontoType = form.watch('paymentScheduleConfig.accontoType');
  const paymentConfigAccontoPercentage = form.watch('paymentScheduleConfig.accontoPercentage');
  const paymentConfigAccontoAmount = form.watch('paymentScheduleConfig.accontoAmount');
  const paymentConfigAccontoRelativeDays = form.watch('paymentScheduleConfig.accontoRelativeDays');
  const paymentConfigRateIntervalDays = form.watch('paymentScheduleConfig.rateIntervalDays');
  const paymentConfigUseEventDateReference = form.watch('paymentScheduleConfig.useEventDateReference');
  
  // Rebuild paymentConfig object for calculations
  const paymentConfig = useMemo(() => ({
    autoGenerate: paymentConfigAutoGenerate ?? false,
    numberOfPayments: paymentConfigNumberOfPayments ?? 2,
    accontoType: paymentConfigAccontoType ?? 'percentage',
    accontoPercentage: paymentConfigAccontoPercentage ?? 30,
    accontoAmount: paymentConfigAccontoAmount ?? 0,
    accontoRelativeDays: paymentConfigAccontoRelativeDays ?? 0,
    rateIntervalDays: paymentConfigRateIntervalDays ?? 30,
    useEventDateReference: paymentConfigUseEventDateReference ?? false,
  }), [
    paymentConfigAutoGenerate,
    paymentConfigNumberOfPayments,
    paymentConfigAccontoType,
    paymentConfigAccontoPercentage,
    paymentConfigAccontoAmount,
    paymentConfigAccontoRelativeDays,
    paymentConfigRateIntervalDays,
    paymentConfigUseEventDateReference,
  ]);
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
      // Controllo limite 5MB
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: 'File troppo grande',
          description: 'L\'immagine deve essere inferiore a 5MB',
          variant: 'destructive'
        });
        return;
      }

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

        // Helper to clean undefined values from objects (Firestore doesn't accept undefined)
        const cleanObject = (obj: any): any => {
          if (Array.isArray(obj)) {
            return obj.filter(v => v !== undefined).map(cleanObject);
          }
          if (obj && typeof obj === 'object') {
            const cleaned: any = {};
            Object.entries(obj).forEach(([key, value]) => {
              if (value !== undefined) {
                cleaned[key] = cleanObject(value);
              }
            });
            return cleaned;
          }
          return obj;
        };

        // Merge catalog + custom products
        const mergedProducts = cleanObject(mergeQuoteProducts(
          data.catalogProductIds,
          data.products.filter(p => p.nome.trim()),
          catalogProducts,
          data.type
        ));

        const subtotale = mergedProducts.reduce((sum: number, p: any) => sum + p.prezzo, 0);

        const discountValidation = validateDiscount(subtotale, data.discountType, data.discountValue);
        if (!discountValidation.valid) {
          throw new Error(discountValidation.error);
        }

        const finalTotals = calculateQuoteTotals(subtotale, data.discountType, data.discountValue);

        // Prepara clausole per l'update
        let updateContractClauses;
        let updateClauseTemplateId;
        
        if (selectedClauseTemplateId) {
          const selectedTemplate = clauseTemplates.find(t => t.id === selectedClauseTemplateId);
          if (selectedTemplate) {
            updateContractClauses = selectedTemplate.clauses.map(c => ({
              id: nanoid(),
              text: c.text,
              required: c.required,
              ordine: c.ordine
            }));
            updateClauseTemplateId = selectedClauseTemplateId;
          }
        }

        const updateData: any = {
          type: data.type,
          products: mergedProducts,
          totalBeforeDiscount: finalTotals.totalBeforeDiscount,
          totalAfterDiscount: finalTotals.totalAfterDiscount,
          expiresAt: data.expiresAt ? Timestamp.fromDate(data.expiresAt) : null,
          noteInterne: data.noteInterne || '',
          updatedAt: Timestamp.now(),
          theme: data.theme,
          discountType: data.discountType,
          discountValue: data.discountValue || 0,
          paymentScheduleConfig: data.paymentScheduleConfig
        };
        
        // Aggiorna clausole se selezionato un template
        if (updateClauseTemplateId) {
          updateData.clauseTemplateId = updateClauseTemplateId;
          updateData.contractClauses = updateContractClauses;
        }

        // Clean all undefined values before saving to Firestore
        const cleanedUpdateData = cleanObject(updateData);

        const quoteRef = doc(collection(db, 'quotes'), editQuoteId);
        await updateDoc(quoteRef, cleanedUpdateData);
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
      
      // Valida sconto PRIMA di calcolare (blocca input invalidi invece di correggere silenziosamente)
      const discountValidation = validateDiscount(subtotale, data.discountType, data.discountValue);
      if (!discountValidation.valid) {
        throw new Error(discountValidation.error);
      }
      
      const finalTotals = calculateQuoteTotals(subtotale, data.discountType, data.discountValue);

      // Prepara jobInfo e clientiInfo per il portale firmato
      const jobInfo = job && job.eventDate ? {
        nomeEvento: job.nomeEvento,
        eventDate: job.eventDate instanceof Date ? job.eventDate : (job.eventDate as any).toDate?.() || new Date(),
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
        expiresAt: data.expiresAt || undefined,
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
      // Refetch queries to ensure UI updates before closing dialog
      await queryClient.refetchQueries({ queryKey: ['quotes', 'job', jobId] });
      await queryClient.invalidateQueries({ queryKey: ['jobs', jobId] });
      if (editQuoteId) {
        await queryClient.invalidateQueries({ queryKey: ['quotes', editQuoteId] });
      }
      
      toast({
        title: editQuoteId ? 'Preventivo aggiornato!' : 'Preventivo creato!',
        description: editQuoteId 
          ? 'Le modifiche sono state salvate correttamente.' 
          : 'Il preventivo è stato salvato. Potrai inviarlo manualmente dalla pagina del lavoro.'
      });
      
      // Reset form with default values to preserve structure
      form.reset({
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
      });
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
      if (!isOpen) {
        const currentCatalogIds = form.getValues('catalogProductIds');
        const currentProducts = form.getValues('products');
        const hasData = (currentCatalogIds && currentCatalogIds.length > 0) || 
                      (currentProducts && currentProducts.some(p => p.nome.trim()));
        
        if (hasData) {
          if (window.confirm('Hai delle modifiche non salvate. Sei sicuro di voler chiudere?')) {
            onClose();
          }
        } else {
          onClose();
        }
      }
    },
    [onClose, form]
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogChange}>
      {/* FIX: Rimuovere overflow dal DialogContent perché blocca i click sui Select/Popover
           e spostare lo scroll in un wrapper interno */}
      <DialogContent 
        className="w-[98vw] sm:max-w-4xl p-0"
        onInteractOutside={(e) => { if (createMutation.isPending) e.preventDefault(); }}
      >
        
        {/* Wrapper scrollabile */}
        <div className="max-h-[90vh] overflow-y-auto px-6 py-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <JobTypeIcon slug={jobType.slug} size="lg" />
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
                  value={selectedClauseTemplateId || '_default'} 
                  onValueChange={(val) => {
                    if (val === '_default') {
                      setSelectedClauseTemplateId('');
                      form.setValue('clauseTemplateId', '');
                    } else {
                      handleClauseTemplateChange(val);
                    }
                  }}
                  data-testid="select-clause-template"
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona template..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                    {/* Opzione default sempre disponibile */}
                    <SelectItem value="_default">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">DEFAULT</Badge>
                        <span>Clausole predefinite</span>
                      </div>
                    </SelectItem>
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
                      <DateInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="gg/mm/aaaa"
                        data-testid="input-expires-at-manual"
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
                            defaultCategory={jobTypeSlug}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <h3 className="text-lg font-semibold">2. Prodotti Custom (opzionale)</h3>
                <div className="flex items-center gap-2">
                  {/* Dropdown prodotti frequenti */}
                  <Select
                    value={frequentProductValue}
                    onValueChange={(value) => {
                      const product = FREQUENT_PRODUCTS.find(p => p.nome === value);
                      if (product) {
                        appendProduct({
                          nome: product.nome,
                          descrizione: product.descrizione,
                          prezzo: product.prezzo,
                          selectable: form.watch('type') === 'variabile',
                          numeroFoto: 0,
                          categoria: '',
                          immagini: [],
                          isOmaggio: false
                        });
                      }
                      setFrequentProductValue('');
                    }}
                  >
                    <SelectTrigger className="w-[200px]" data-testid="select-frequent-product">
                      <SelectValue placeholder="Prodotti frequenti..." />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENT_PRODUCTS.map((product) => (
                        <SelectItem key={product.nome} value={product.nome}>
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate">{product.nome}</span>
                            <span className="text-muted-foreground text-xs">€{product.prezzo}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => appendProduct({
                      nome: '',
                      descrizione: '',
                      prezzo: 0,
                      selectable: form.watch('type') === 'variabile',
                      numeroFoto: 0,
                      categoria: '',
                      immagini: [],
                      isOmaggio: false
                    })}
                    data-testid="button-add-custom-product"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Vuoto
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-rose-300 text-rose-600 hover:bg-rose-50"
                    onClick={() => appendProduct({
                      nome: '',
                      descrizione: '',
                      prezzo: 0,
                      selectable: false,
                      numeroFoto: 0,
                      categoria: '',
                      immagini: [],
                      isOmaggio: true
                    })}
                    data-testid="button-add-omaggio-product"
                  >
                    🎁 Omaggio
                  </Button>
                </div>
              </div>

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={fields.map(f => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {fields.map((field, index) => {
                      const productName = watchedProducts?.[index]?.nome || '';
                      const productPrice = watchedProducts?.[index]?.prezzo || 0;
                      const isOmaggioProduct = watchedProducts?.[index]?.isOmaggio || false;
                      const hasName = productName.trim().length > 0;
                      const hasPrice = productPrice > 0;
                      const isIncomplete = !isOmaggioProduct && ((hasName && !hasPrice) || (!hasName && hasPrice));
                      const isEmpty = !hasName && !hasPrice;
                      
                      return (
                        <SortableProductCard
                          key={field.id}
                          id={field.id}
                          index={index}
                          isIncomplete={isIncomplete}
                          isEmpty={isEmpty}
                          hasName={hasName}
                          fieldsLength={fields.length}
                          onRemove={() => {
                            setExpandedProducts(prev => {
                              const newSet = new Set(prev);
                              newSet.delete(field.id);
                              return newSet;
                            });
                            remove(index);
                          }}
                          isExpanded={expandedProducts.has(field.id)}
                          onToggleExpand={() => {
                            setExpandedProducts(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(field.id)) {
                                newSet.delete(field.id);
                              } else {
                                newSet.add(field.id);
                              }
                              return newSet;
                            });
                          }}
                          productName={productName}
                          productPrice={productPrice}
                          isOmaggio={isOmaggioProduct}
                        >
                          <div className="space-y-4">

                        {/* Toggle Omaggio */}
                        <FormField
                          control={form.control}
                          name={`products.${index}.isOmaggio`}
                          render={({ field }) => (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-rose-50 border border-rose-200">
                              <Switch
                                checked={field.value || false}
                                onCheckedChange={(checked) => {
                                  field.onChange(checked);
                                  if (checked) {
                                    form.setValue(`products.${index}.prezzo`, 0);
                                    form.setValue(`products.${index}.selectable`, false);
                                  }
                                }}
                                data-testid={`switch-omaggio-${index}`}
                              />
                              <div>
                                <Label className="text-rose-700 font-medium">🎁 Prodotto in omaggio</Label>
                                <p className="text-xs text-rose-500">Prezzo = €0, visibile nel contratto come "In omaggio"</p>
                              </div>
                            </div>
                          )}
                        />

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
                                <FormLabel>
                                  Prezzo €{isOmaggioProduct ? '' : ' *'}
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    placeholder={isOmaggioProduct ? "Omaggio (€0)" : "0"}
                                    {...field}
                                    disabled={isOmaggioProduct}
                                    value={isOmaggioProduct ? 0 : field.value}
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    data-testid={`input-product-price-${index}`}
                                    className={isOmaggioProduct ? "bg-rose-50 text-rose-400" : ""}
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
                        </SortableProductCard>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
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

                    {paymentConfig?.useEventDateReference && !job?.eventDate && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        ⚠️ Il lavoro non ha una data evento impostata. Le scadenze relative all'evento non potranno essere calcolate correttamente.
                      </div>
                    )}

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
                onClick={() => handleDialogChange(false)}
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
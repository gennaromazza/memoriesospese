/**
 * QUOTE TEMPLATES MANAGER
 * Interfaccia admin per gestire template preventivi riutilizzabili
 */

import { useState, useMemo, useEffect, useRef, useCallback, memo, startTransition } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  getAllQuoteTemplates,
  createQuoteTemplate,
  updateQuoteTemplate,
  deleteQuoteTemplate,
  toggleTemplateActive,
  updateTemplatesOrder,
  getQuoteTemplate
} from '@/lib/quotes';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
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
  Package,
  MoreVertical,
  GripVertical,
  ChevronDown,
  ChevronUp
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
import type { QuoteProduct, QuoteTemplate } from '@shared/quotes-types';
import { catalogProductToQuoteProduct } from '@/lib/quote-mappers';
import { calculateQuoteTotals, validateDiscount } from '@shared/quote-utils';

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
}).refine((data) => {
  const hasType = data.discountType !== undefined;
  const hasValue = data.discountValue !== undefined;
  return hasType === hasValue;
}, {
  message: 'Tipo e valore sconto devono essere entrambi specificati o entrambi vuoti',
  path: ['discountType']
}).refine((data) => {
  // Validazione: almeno un prodotto (catalogo o custom)
  const hasValidCustomProducts = data.customProducts.some(p => p.nome.trim() && p.prezzo > 0);
  return data.catalogProductIds.length > 0 || hasValidCustomProducts;
}, {
  message: 'Inserisci almeno un prodotto (catalogo o custom)',
  path: ['customProducts']
});

type FormData = z.infer<typeof templateSchema>;

// Sortable Template Card Component - memoized to prevent unnecessary re-renders
const SortableTemplateCard = memo(function SortableTemplateCard({
  template,
  jobTypes,
  onEdit,
  onDelete,
  onToggle,
}: {
  template: QuoteTemplate & { id: string };
  jobTypes: any[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (checked: boolean) => void;
}) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: template.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const jobType = jobTypes.find((jt) => jt.slug === template.jobType);
  const totale = template.defaultProducts.reduce(
    (sum, p) => sum + p.prezzo,
    0,
  );

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={!template.attivo ? "opacity-60" : ""}>
        <CardHeader>
          <div className="flex items-start gap-3">
            {/* Drag Handle */}
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing pt-1"
            >
              <GripVertical className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {jobType && <JobTypeIcon slug={jobType.slug} size="md" />}
                    {template.nome}
                  </CardTitle>
                  <CardDescription>
                    {jobType?.nome || template.jobType}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={template.attivo}
                    onCheckedChange={onToggle}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="z-[200]">
                      <DropdownMenuItem onClick={onEdit}>
                        <Edit2 className="h-4 w-4 mr-2" />
                        Modifica
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIsPreviewOpen(!isPreviewOpen)}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        {isPreviewOpen ? "Nascondi" : "Anteprima"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={onDelete}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tipo:</span>
            <Badge variant="outline">
              {template.type === "fisso" ? "Fisso" : "Variabile"}
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

          {/* Preview Expandable */}
          <Collapsible open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full mt-2">
                {isPreviewOpen ? (
                  <ChevronUp className="h-4 w-4 mr-2" />
                ) : (
                  <ChevronDown className="h-4 w-4 mr-2" />
                )}
                {isPreviewOpen ? "Nascondi prodotti" : "Mostra prodotti"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              <div className="text-xs font-semibold text-muted-foreground">
                PRODOTTI INCLUSI
              </div>
              {template.defaultProducts.map((product, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-start text-sm border-l-2 border-sage/20 pl-2"
                >
                  <div className="flex-1">
                    <div className="font-medium">{product.nome}</div>
                    {product.descrizione && (
                      <div className="text-xs text-muted-foreground">
                        {product.descrizione}
                      </div>
                    )}
                  </div>
                  <div className="font-semibold">€{product.prezzo}</div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
});

export default function QuoteTemplatesManager() {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Query templates
  const { data: templatesData = [], isLoading } = useQuery({
    queryKey: ['quote-templates'],
    queryFn: getAllQuoteTemplates
  });

  // Sort templates by ordine field
  const templates = useMemo(() => {
    return [...templatesData].sort((a, b) => {
      if (a.ordine !== undefined && b.ordine !== undefined) {
        return a.ordine - b.ordine;
      }
      return 0;
    });
  }, [templatesData]);

  // Query job types - only active ones
  const { data: jobTypes = [] } = useQuery({
    queryKey: ['job-types'],
    queryFn: async () => {
      const allJobTypes = await getJobTypes();
      return allJobTypes.filter(jt => jt.attivo);
    }
  });

  // Query catalog products
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: getAllProducts
  });

  // Query single template for editing
  const { data: editingTemplate } = useQuery({
    queryKey: ['quote-template', editingTemplateId],
    queryFn: () => getQuoteTemplate(editingTemplateId!),
    enabled: !!editingTemplateId,
  });

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

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
    name: 'customProducts',
    shouldUnregister: false
  });

  // Ref to track which template has been initialized
  const initializedTemplateId = useRef<string | null>(null);

  // Reset form to defaults when opening create modal
  useEffect(() => {
    if (createModalOpen && !editModalOpen) {
      form.reset({
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
        attivo: true,
        discountType: undefined,
        discountValue: undefined
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createModalOpen, editModalOpen]);

  // Load editing template data into form when editingTemplate changes
  useEffect(() => {
    if (editingTemplate && editModalOpen) {
      // Skip if we've already initialized this template
      if (initializedTemplateId.current === editingTemplate.id) {
        return;
      }
      
      initializedTemplateId.current = editingTemplate.id;
      
      const customProducts = editingTemplate.defaultProducts
        .filter((p) => !p.productId)
        .map((p) => ({
          nome: p.nome,
          descrizione: p.descrizione || '',
          prezzo: p.prezzo,
          numeroFoto: p.numeroFoto || 0,
          categoria: p.categoria || '',
        }));

      const catalogProductIds = editingTemplate.defaultProducts
        .filter((p) => p.productId)
        .map((p) => p.productId!);

      form.reset({
        nome: editingTemplate.nome,
        jobType: editingTemplate.jobType as string,
        type: editingTemplate.type,
        catalogProductIds,
        customProducts:
          customProducts.length > 0
            ? customProducts
            : [
                {
                  nome: '',
                  descrizione: '',
                  prezzo: 0,
                  numeroFoto: 0,
                  categoria: '',
                },
              ],
        discountType: editingTemplate.discountType,
        discountValue: editingTemplate.discountValue,
        theme: editingTemplate.theme,
        attivo: editingTemplate.attivo,
      });
    }
    
    // Reset the ref when modal closes
    if (!editModalOpen) {
      initializedTemplateId.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTemplate?.id, editModalOpen]); // Depend on editingTemplate?.id to reset when a new template is selected

  // Watch values for totals using useWatch for better performance
  const catalogProductIds = useWatch({ control: form.control, name: 'catalogProductIds' }) || [];
  const customProducts = useWatch({ control: form.control, name: 'customProducts' }) || [];
  const discountType = useWatch({ control: form.control, name: 'discountType' });
  const discountValue = useWatch({ control: form.control, name: 'discountValue' }) || 0;

  // Calculate totals
  const totaleCatalogo = catalogProductIds.reduce((sum, id) => {
    const product = catalogProducts.find(p => p.id === id);
    return sum + (product?.prezzoFinale || product?.prezzo || 0);
  }, 0);

  const totaleCustom = customProducts
    .filter(p => p.nome?.trim())
    .reduce((sum, p) => sum + (p.prezzo || 0), 0);

  const subtotale = totaleCatalogo + totaleCustom;

  // Usa utility condivisa per coerenza con QuoteBuilder
  const { totalAfterDiscount, discountAmount } = calculateQuoteTotals(subtotale, discountType, discountValue);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Merge catalog + custom products
      const catalogQuoteProducts: QuoteProduct[] = data.catalogProductIds.map(id => {
        const product = catalogProducts.find(p => p.id === id);
        if (!product) throw new Error(`Prodotto ${id} non trovato`);
        return catalogProductToQuoteProduct(product, data.type);
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

      // Valida sconto PRIMA di salvare
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        const subtotale = allProducts.reduce((sum, p) => sum + p.prezzo, 0);
        const discountValidation = validateDiscount(subtotale, data.discountType, data.discountValue);
        if (!discountValidation.valid) {
          throw new Error(discountValidation.error);
        }
      }

      // Clausole di default
      const defaultClauses = [
        {
          text: 'Il cliente accetta i termini e condizioni del servizio',
          required: true
        }
      ];

      const templateData: any = {
        nome: data.nome,
        jobType: data.jobType,
        type: data.type,
        theme: data.theme,
        defaultProducts: allProducts,
        defaultClauses,
        attivo: data.attivo
      };

      // Only include discount fields if they are actually defined
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        templateData.discountType = data.discountType;
        templateData.discountValue = data.discountValue;
      }

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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const catalogQuoteProducts: QuoteProduct[] = data.catalogProductIds.map(prodId => {
        const product = catalogProducts.find(p => p.id === prodId);
        if (!product) throw new Error(`Prodotto ${prodId} non trovato`);
        return catalogProductToQuoteProduct(product, data.type);
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

      // Valida sconto PRIMA di salvare
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        const subtotale = allProducts.reduce((sum, p) => sum + p.prezzo, 0);
        const discountValidation = validateDiscount(subtotale, data.discountType, data.discountValue);
        if (!discountValidation.valid) {
          throw new Error(discountValidation.error);
        }
      }

      const updateData: any = {
        nome: data.nome,
        jobType: data.jobType,
        type: data.type,
        theme: data.theme,
        defaultProducts: allProducts,
        defaultClauses: editingTemplate?.defaultClauses || [
          {
            text: 'Il cliente accetta i termini e condizioni del servizio',
            required: true
          }
        ],
        attivo: data.attivo
      };

      // Only include discount fields if they are actually defined
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        updateData.discountType = data.discountType;
        updateData.discountValue = data.discountValue;
      }

      await updateQuoteTemplate(id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
      toast({
        title: 'Template aggiornato!',
        description: 'Le modifiche sono state salvate'
      });
      setEditModalOpen(false);
      setEditingTemplateId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteQuoteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
      toast({
        title: 'Template eliminato',
        description: 'Il template è stato disattivato'
      });
      setDeleteTemplateId(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, attivo }: { id: string; attivo: boolean }) =>
      toggleTemplateActive(id, attivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
    }
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: updateTemplatesOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quote-templates'] });
      toast({
        title: 'Ordine salvato',
        description: 'La nuova disposizione è stata salvata'
      });
    }
  });

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = templates.findIndex(t => t.id === active.id);
      const newIndex = templates.findIndex(t => t.id === over.id);

      const newTemplates = arrayMove(templates, oldIndex, newIndex);
      const newOrder = newTemplates.map(t => t.id);

      // Optimistic update
      queryClient.setQueryData(['quote-templates'], newTemplates);

      // Persist to Firestore
      reorderMutation.mutate(newOrder);
    }
  };

  const onSubmit = (data: FormData) => {
    if (editModalOpen && editingTemplateId) {
      // Edit mode
      updateMutation.mutate({ id: editingTemplateId, data });
    } else {
      // Create mode
      createMutation.mutate(data);
    }
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

      {/* Templates Grid with Drag & Drop */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">
              Nessun template creato
            </p>
            <Button onClick={() => setCreateModalOpen(true)} className="bg-sage hover:bg-dark-sage" data-testid="button-create-template">
              <Plus className="h-4 w-4 mr-2" />
              Crea il primo template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={templates.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <SortableTemplateCard
                  key={template.id}
                  template={template as QuoteTemplate & { id: string }}
                  jobTypes={jobTypes}
                  onEdit={() => {
                    startTransition(() => {
                      setEditingTemplateId(template.id);
                      setEditModalOpen(true);
                    });
                  }}
                  onDelete={() => setDeleteTemplateId(template.id)}
                  onToggle={(checked) =>
                    toggleMutation.mutate({
                      id: template.id,
                      attivo: checked,
                    })
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Create/Edit Template Modal */}
      <Dialog
        open={createModalOpen || editModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateModalOpen(false);
            setEditModalOpen(false);
            setEditingTemplateId(null);
            form.reset();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {editModalOpen ? 'Modifica Template Preventivo' : 'Crea Template Preventivo'}
            </DialogTitle>
            <DialogDescription>
              {editModalOpen
                ? 'Modifica il template con nuovi prodotti e prezzi'
                : 'Crea un template riutilizzabile con prodotti e prezzi preimpostati'}
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
                            <SelectValue placeholder="Seleziona tipo...">
                              {field.value && jobTypes.length > 0 ? (
                                <span className="flex items-center gap-2">
                                  <JobTypeIcon slug={field.value} size="sm" />
                                  {jobTypes.find(jt => jt.slug === field.value)?.nome}
                                </span>
                              ) : (
                                'Seleziona tipo...'
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent position="popper" sideOffset={4} className="z-[9999]">
                          {jobTypes.length === 0 ? (
                            <SelectItem value="none" disabled>
                              Nessun tipo lavoro configurato
                            </SelectItem>
                          ) : (
                            jobTypes.map(jt => (
                              <SelectItem key={jt.id} value={jt.slug}>
                                <span className="flex items-center gap-2">
                                  <JobTypeIcon slug={jt.slug} size="sm" />
                                  {jt.nome}
                                </span>
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        {jobTypes.length} tipi disponibili
                      </FormDescription>
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
                      <SelectContent position="popper" sideOffset={4} className="z-[9999]">
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
                        <Select value={field.value || 'none'} onValueChange={(val) => {
                          if (val === 'none') {
                            field.onChange(undefined);
                            form.setValue('discountValue', undefined);
                          } else {
                            field.onChange(val);
                          }
                        }}>
                          <FormControl>
                            <SelectTrigger>
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
                  onClick={() => {
                    setCreateModalOpen(false);
                    setEditModalOpen(false);
                    setEditingTemplateId(null);
                    form.reset();
                  }}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="bg-sage hover:bg-dark-sage"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editModalOpen ? 'Salva Modifiche' : 'Crea Template'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deleteTemplateId}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTemplateId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo template?</AlertDialogTitle>
            <AlertDialogDescription>
              Il template verrà disattivato e non sarà più disponibile per la
              creazione di nuovi preventivi. I preventivi esistenti creati da
              questo template non saranno modificati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateId && deleteMutation.mutate(deleteTemplateId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
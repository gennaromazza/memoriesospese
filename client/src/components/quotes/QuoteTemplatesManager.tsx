/**
 * QUOTE TEMPLATES MANAGER
 * Interfaccia admin per gestire template preventivi riutilizzabili
 */

import { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { nanoid } from "nanoid";
import {
  getAllQuoteTemplates,
  createQuoteTemplate,
  updateQuoteTemplate,
  deleteQuoteTemplate,
  toggleTemplateActive,
  updateTemplatesOrder,
} from "@/lib/quotes";
import { deleteField } from "firebase/firestore";
import { getAllProducts } from "@/lib/products";
import { getJobTypes } from "@/lib/job-types";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import CatalogProductSelector from "./CatalogProductSelector";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  ChevronUp,
  Link2,
  ExternalLink,
  Users,
  Gift,
  Lock,
  Unlock,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import type { BenefitRule } from "@shared/quote-benefits";
import ProductOrderEditor, { type OrderableProduct } from "./ProductOrderEditor";
import { computeBenefitStates, migrateBenefitRules } from "@shared/quote-benefits";
import { useLocation } from "wouter";
import { getAuth } from "firebase/auth";
import { Checkbox } from "@/components/ui/checkbox";
import { JobTypeIcon } from "@/lib/job-type-icons";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QuoteProduct, QuoteTemplate } from "@shared/quotes-types";
import { catalogProductToQuoteProduct } from "@/lib/quote-mappers";
import { calculateQuoteTotals, validateDiscount } from "@shared/quote-utils";

const templateSchema = z
  .object({
    nome: z.string().min(1, "Nome richiesto"),
    jobType: z.string().min(1, "Tipo lavoro richiesto"),
    type: z.enum(["fisso", "variabile"]),
    catalogProductIds: z.array(z.string()).default([]),
    customProducts: z.array(
      z.object({
        nome: z.string(),
        descrizione: z.string(),
        prezzo: z.number().min(0),
        sezione: z.string().optional(),
        numeroFoto: z.number().optional(),
        categoria: z.string().optional(),
        // Per template variabili: false = prodotto sempre incluso (Fisso)
        selectable: z.boolean().optional(),
      }),
    ),
    discountType: z.preprocess(
      (val) => (val === "" ? undefined : val),
      z.enum(["amount", "percent"]).optional()
    ),
    discountValue: z.number().min(0).optional(),
    theme: z.object({
      primaryColor: z.string(),
      secondaryColor: z.string(),
      footerText: z.string().optional(),
    }),
    attivo: z.boolean().default(true),
  })
  .refine(
    (data) => {
      const hasType = data.discountType !== undefined;
      const hasValue = data.discountValue !== undefined;
      return hasType === hasValue;
    },
    {
      message:
        "Tipo e valore sconto devono essere entrambi specificati o entrambi vuoti",
      path: ["discountType"],
    },
  )
  .refine(
    (data) => {
      // Validazione: almeno un prodotto (catalogo o custom)
      const hasValidCustomProducts = data.customProducts.some(
        (p) => p.nome.trim() && p.prezzo > 0,
      );
      return data.catalogProductIds.length > 0 || hasValidCustomProducts;
    },
    {
      message: "Inserisci almeno un prodotto (catalogo o custom)",
      path: ["customProducts"],
    },
  );

type FormData = z.infer<typeof templateSchema>;

// Sortable Template Card Component - memoized to prevent unnecessary re-renders
const SortableTemplateCard = memo(function SortableTemplateCard({
  template,
  jobTypes,
  onEdit,
  onDelete,
  onToggle,
  onGenerateLink,
  onCompilainStudio,
}: {
  template: QuoteTemplate & { id: string };
  jobTypes: any[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (checked: boolean) => void;
  onGenerateLink: () => void;
  onCompilainStudio: () => void;
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
  const subtotale = template.defaultProducts.reduce((sum, p) => sum + (Number(p.prezzo) || 0), 0);
  const { totalAfterDiscount, discountAmount } = calculateQuoteTotals(
    subtotale,
    template.discountType,
    template.discountValue,
  );
  const hasDiscount = discountAmount > 0;

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
                      <DropdownMenuItem onClick={onGenerateLink}>
                        <Link2 className="h-4 w-4 mr-2" />
                        {template.shareableToken ? "Copia Link Rapido" : "Genera Link Rapido"}
                      </DropdownMenuItem>
                      {template.shareableToken && (
                        <DropdownMenuItem
                          onClick={() => window.open(`/preventivo-rapido/${template.shareableToken}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Apri Modulo Cliente
                        </DropdownMenuItem>
                      )}
                      {template.shareableToken && (
                        <DropdownMenuItem onClick={onCompilainStudio}>
                          <Users className="h-4 w-4 mr-2" />
                          Compila in Studio
                        </DropdownMenuItem>
                      )}
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
          {hasDiscount && (
            <div className="flex items-center justify-between text-sm text-orange-600">
              <span className="text-muted-foreground">Subtotale:</span>
              <span className="line-through">
                €{subtotale.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Totale:</span>
            <span className="text-lg font-bold text-sage">
              €{totalAfterDiscount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
  const [, navigate] = useLocation();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<(QuoteTemplate & { id: string }) | null>(null);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const [studioModalTemplate, setStudioModalTemplate] = useState<(QuoteTemplate & { id: string }) | null>(null);
  const [studioForm, setStudioForm] = useState({ nome: '', cognome: '', email: '', cellulare: '', nomeEvento: '', eventDate: '', dataNonDefinita: false });
  const [studioSubmitting, setStudioSubmitting] = useState(false);

  // Benefit rules state (gestito fuori da react-hook-form come in QuoteBuilder)
  const [benefitRules, setBenefitRules] = useState<BenefitRule[]>([]);
  const [expandedBenefitRules, setExpandedBenefitRules] = useState<Set<string>>(new Set());

  // Product order state — tracks the display order chosen by the admin
  const [productOrderKeys, setProductOrderKeys] = useState<string[]>([]);

  // Sections for catalog products (managed outside form — same pattern as QuoteBuilder)
  const [catalogProductSections, setCatalogProductSections] = useState<Record<string, string>>({});
  // Override per prodotti catalogo: prezzo (snapshot solo nel template) e selectable (Fisso/Extra).
  // Le chiavi sono productId. Non tocca il catalogo prodotti.
  const [catalogOverrides, setCatalogOverrides] = useState<Record<string, { prezzo?: number; selectable?: boolean }>>({});
  // Tiene traccia del template in editing per re-idratare gli override quando catalogProducts arriva tardi
  const pendingEditTemplateRef = useRef<(QuoteTemplate & { id: string }) | null>(null);
  const lastHydratedTemplateIdRef = useRef<string | null>(null);

  // Query catalogo prodotti (necessaria PRIMA del re-hydration effect)

  // Query templates
  const { data: templatesData = [], isLoading } = useQuery({
    queryKey: ["quote-templates"],
    queryFn: getAllQuoteTemplates,
  });

  // Sort templates by ordine field
  const templates = useMemo(() => {
    return [...templatesData].sort((a, b) => {
      const ao = a.ordine ?? Number.MAX_SAFE_INTEGER;
      const bo = b.ordine ?? Number.MAX_SAFE_INTEGER;
      return ao - bo;
    });
  }, [templatesData]);

  // Query job types - only active ones
  const { data: jobTypes = [] } = useQuery({
    queryKey: ["job-types"],
    queryFn: async () => {
      const allJobTypes = await getJobTypes();
      return allJobTypes.filter((jt) => jt.attivo);
    },
  });

  // Query catalog products
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ["products"],
    queryFn: getAllProducts,
  });

  // Re-hydration override quando catalogProducts arriva dopo handleEditTemplate
  // (race: editor aperto prima che la query products sia risolta).
  useEffect(() => {
    const tmpl = pendingEditTemplateRef.current;
    if (!tmpl) return;
    if (!catalogProducts || catalogProducts.length === 0) return;
    if (lastHydratedTemplateIdRef.current === tmpl.id) return;
    const rebuilt: Record<string, { prezzo?: number; selectable?: boolean }> = {};
    const defaultSelectable = tmpl.type === 'variabile';
    tmpl.defaultProducts
      .filter(p => p.productId)
      .forEach(p => {
        const catalogP = catalogProducts.find(cp => cp.id === p.productId);
        const catalogPrice = catalogP ? (catalogP.prezzoFinale || catalogP.prezzo || 0) : undefined;
        const ov: { prezzo?: number; selectable?: boolean } = {};
        if (catalogPrice !== undefined && Math.round(p.prezzo * 100) !== Math.round(catalogPrice * 100)) {
          ov.prezzo = p.prezzo;
        }
        if (p.selectable !== undefined && p.selectable !== defaultSelectable) {
          ov.selectable = !!p.selectable;
        }
        if (ov.prezzo !== undefined || ov.selectable !== undefined) {
          rebuilt[p.productId!] = ov;
        }
      });
    setCatalogOverrides(rebuilt);
    lastHydratedTemplateIdRef.current = tmpl.id;
  }, [catalogProducts]);

  const handleGenerateLink = useCallback(async (template: QuoteTemplate & { id: string }) => {
    try {
      if (template.shareableToken) {
        const url = `${window.location.origin}/preventivo-rapido/${template.shareableToken}`;
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copiato!",
          description: "Il link del Preventivo Rapido è stato copiato negli appunti.",
        });
        return;
      }

      const response = await apiRequest(
        "POST",
        `/api/quotes/quick/generate-token/${template.id}`
      );
      const data = await response.json();

      if (data.success && data.shareableToken) {
        const url = `${window.location.origin}/preventivo-rapido/${data.shareableToken}`;
        await navigator.clipboard.writeText(url);
        queryClient.invalidateQueries({ queryKey: ["quote-templates"] });
        toast({
          title: "Link generato e copiato!",
          description: "Il link del Preventivo Rapido è stato generato e copiato negli appunti. Puoi condividerlo via WhatsApp.",
        });
      }
    } catch (error) {
      console.error("Errore generazione link:", error);
      toast({
        title: "Errore",
        description: "Impossibile generare il link. Riprova.",
        variant: "destructive",
      });
    }
  }, [toast]);

  const handleCompilainStudio = useCallback(async () => {
    if (!studioModalTemplate?.shareableToken) return;
    if (!studioForm.nome.trim() || !studioForm.cognome.trim() || !studioForm.nomeEvento.trim()) {
      toast({ title: "Dati mancanti", description: "Inserisci nome, cognome e nome evento.", variant: "destructive" });
      return;
    }
    setStudioSubmitting(true);
    try {
      const idToken = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/quotes/quick/${studioModalTemplate.shareableToken}/activate-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${idToken}` },
        body: JSON.stringify({
          nome: studioForm.nome.trim(),
          cognome: studioForm.cognome.trim(),
          email: studioForm.email.trim() || undefined,
          cellulare: studioForm.cellulare.trim() || undefined,
          nomeEvento: studioForm.nomeEvento.trim(),
          eventDate: (!studioForm.dataNonDefinita && studioForm.eventDate) ? new Date(studioForm.eventDate).toISOString() : undefined,
          dataNonDefinita: studioForm.dataNonDefinita,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Errore server');
      setStudioModalTemplate(null);
      setStudioForm({ nome: '', cognome: '', email: '', cellulare: '', nomeEvento: '', eventDate: '', dataNonDefinita: false });
      toast({ title: "Preventivo creato!", description: "Job e preventivo creati. Apertura in corso..." });
      navigate(`/admin/jobs/${data.jobId}`);
    } catch (err: any) {
      toast({ title: "Errore", description: err.message || "Impossibile creare il preventivo.", variant: "destructive" });
    } finally {
      setStudioSubmitting(false);
    }
  }, [studioModalTemplate, studioForm, toast, navigate]);

  // Drag & Drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Form
  const form = useForm<FormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      nome: "",
      jobType: "",
      type: "fisso",
      catalogProductIds: [],
      customProducts: [
        {
          nome: "",
          descrizione: "",
          prezzo: 0,
          numeroFoto: 0,
          categoria: "",
        },
      ],
      theme: {
        primaryColor: "#8B9A8B",
        secondaryColor: "#C8B8A8",
        footerText: "Image Studio - Fotografia professionale",
      },
      attivo: true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "customProducts",
    shouldUnregister: false,
  });

  // Handle edit template - directly set form data without useEffect loop
  const handleEditTemplate = useCallback((template: QuoteTemplate & { id: string }) => {
    // Split defaultProducts into catalog and custom
    const customProductsData = template.defaultProducts
      .filter((p) => !p.productId)
      .map((p) => ({
        nome: p.nome,
        descrizione: p.descrizione || "",
        prezzo: p.prezzo,
        sezione: (p as any).sezione || "",
        numeroFoto: p.numeroFoto || 0,
        categoria: p.categoria || "",
        // Preserva selectable salvato (solo per template variabili è significativo)
        selectable: p.selectable,
      }));

    const catalogProductIdsData = template.defaultProducts
      .filter((p) => p.productId)
      .map((p) => p.productId!);

    // Ricostruisci gli override (prezzo + selectable) dai prodotti catalogo salvati
    const initialCatalogOverrides: Record<string, { prezzo?: number; selectable?: boolean }> = {};
    template.defaultProducts
      .filter((p) => p.productId)
      .forEach((p) => {
        const catalogP = catalogProducts.find((cp) => cp.id === p.productId);
        const catalogPrice = catalogP ? (catalogP.prezzoFinale || catalogP.prezzo || 0) : undefined;
        const override: { prezzo?: number; selectable?: boolean } = {};
        // Considera override prezzo se differisce dal listino (tolleranza centesimi)
        if (catalogPrice !== undefined && Math.round(p.prezzo * 100) !== Math.round(catalogPrice * 100)) {
          override.prezzo = p.prezzo;
        }
        // Override selectable: salva se differisce dal default-by-type
        const defaultSelectable = template.type === 'variabile';
        if (p.selectable !== undefined && p.selectable !== defaultSelectable) {
          override.selectable = p.selectable;
        }
        if (override.prezzo !== undefined || override.selectable !== undefined) {
          initialCatalogOverrides[p.productId!] = override;
        }
      });
    setCatalogOverrides(initialCatalogOverrides);
    // Marca il template attualmente in editing per consentire re-hydration
    // quando catalogProducts arriva tardi (vedi useEffect più sotto).
    pendingEditTemplateRef.current = template;

    // Reset form with template data
    form.reset({
      nome: template.nome,
      jobType: template.jobType as string,
      type: template.type,
      catalogProductIds: catalogProductIdsData,
      customProducts:
        customProductsData.length > 0
          ? customProductsData
          : [
              {
                nome: "",
                descrizione: "",
                prezzo: 0,
                sezione: "",
                numeroFoto: 0,
                categoria: "",
              },
            ],
      discountType: template.discountType,
      discountValue: template.discountValue !== undefined ? Number(template.discountValue) : undefined,
      theme: template.theme,
      attivo: template.attivo,
    });

    // Ripristina sezioni dei prodotti catalogo dal template salvato
    const initialCatalogSections: Record<string, string> = {};
    template.defaultProducts
      .filter((p) => p.productId && (p as any).sezione)
      .forEach((p) => { initialCatalogSections[p.productId!] = (p as any).sezione; });
    setCatalogProductSections(initialCatalogSections);

    // Carica benefit rules dal template
    setBenefitRules(migrateBenefitRules((template as any).benefitRules ?? []));
    setExpandedBenefitRules(new Set());

    // Inizializza l'ordine prodotti dall'ordine salvato nel template
    const initialOrderKeys = template.defaultProducts.map((p: any) =>
      p.productId ? `cat:${p.productId}` : `cust:${p.nome?.trim() || ''}`
    ).filter((k: string) => k !== 'cust:');
    setProductOrderKeys(initialOrderKeys);

    // Store template for update mutation (to preserve defaultClauses)
    setCurrentTemplate(template);
    setEditModalOpen(true);
  }, [form, catalogProducts]);

  // Handle create modal open
  const handleCreateTemplate = useCallback(() => {
    form.reset({
      nome: "",
      jobType: "",
      type: "fisso",
      catalogProductIds: [],
      customProducts: [
        {
          nome: "",
          descrizione: "",
          prezzo: 0,
          numeroFoto: 0,
          categoria: "",
        },
      ],
      theme: {
        primaryColor: "#8B9A8B",
        secondaryColor: "#C8B8A8",
        footerText: "Image Studio - Fotografia professionale",
      },
      attivo: true,
      discountType: undefined,
      discountValue: undefined,
    });
    setCurrentTemplate(null);
    setBenefitRules([]);
    setExpandedBenefitRules(new Set());
    setProductOrderKeys([]);
    setCatalogProductSections({});
    setCatalogOverrides({});
    // Resetta i ref di tracking per evitare re-hydration spuria
    pendingEditTemplateRef.current = null;
    lastHydratedTemplateIdRef.current = null;
    setCreateModalOpen(true);
  }, [form]);

  // Watch values for totals using useWatch for better performance
  // NOTA: customProducts NON usa useWatch perché useFieldArray è già attivo sullo
  // stesso campo — avere due subscriber sullo stesso campo causa render in cascata.
  // Usiamo direttamente `fields` di useFieldArray per i valori correnti.
  const catalogProductIds =
    useWatch({ control: form.control, name: "catalogProductIds" }) || [];
  const discountType = useWatch({
    control: form.control,
    name: "discountType",
  });
  const discountValue =
    Number(useWatch({ control: form.control, name: "discountValue" })) || 0;
  const quoteType = useWatch({ control: form.control, name: "type" });

  // Gestisce cambio sezione da ProductOrderEditor (catalogo e custom)
  const handleSectionChange = useCallback((key: string, sezione: string) => {
    if (key.startsWith('cat:')) {
      const id = key.slice(4);
      setCatalogProductSections(prev => ({ ...prev, [id]: sezione.trim() }));
    } else if (key.startsWith('cust:')) {
      const nome = key.slice(5);
      const products = form.getValues('customProducts');
      const idx = products.findIndex((p: any) => p.nome.trim() === nome);
      if (idx >= 0) {
        form.setValue(`customProducts.${idx}.sezione`, sezione.trim());
      }
    }
  }, [form]);

  // Merged product list for ProductOrderEditor (catalog + custom)
  // Usa fields (da useFieldArray) per i custom products, catalogProductIds per i catalog.
  // Applica gli override del template (prezzo + selectable) sui prodotti catalogo.
  const mergedForOrderEditor = useMemo<OrderableProduct[]>(() => {
    const defaultSelectable = quoteType === 'variabile';
    const cat: OrderableProduct[] = catalogProductIds.map((id: string) => {
      const p = catalogProducts.find((cp) => cp.id === id);
      const sezione = catalogProductSections[id];
      const ov = catalogOverrides[id];
      const basePrice = p?.prezzoFinale || p?.prezzo || 0;
      const selectable = ov?.selectable !== undefined ? ov.selectable : defaultSelectable;
      return {
        key: `cat:${id}`,
        nome: p?.nome || id,
        prezzo: ov?.prezzo !== undefined ? ov.prezzo : basePrice,
        originalPrice: basePrice,
        isFromCatalog: true,
        sezione: sezione || undefined,
        selectable,
      };
    });
    const cust: OrderableProduct[] = fields
      .filter((f) => f.nome?.trim())
      .map((f) => ({
        key: `cust:${f.nome.trim()}`,
        nome: f.nome,
        prezzo: f.prezzo || 0,
        sezione: (f as any).sezione || undefined,
        selectable: (f as any).selectable !== undefined ? (f as any).selectable : defaultSelectable,
      }));
    return [...cat, ...cust];
  }, [catalogProductIds, fields, catalogProducts, catalogProductSections, catalogOverrides, quoteType]);

  // Handler per modifica prezzo inline (override solo per questo template)
  const handlePriceChange = useCallback((key: string, prezzo: number) => {
    if (key.startsWith('cat:')) {
      const id = key.slice(4);
      setCatalogOverrides(prev => {
        const next = { ...prev };
        const cur = next[id] || {};
        next[id] = { ...cur, prezzo };
        return next;
      });
    } else if (key.startsWith('cust:')) {
      const nome = key.slice(5);
      const products = form.getValues('customProducts');
      const idx = products.findIndex((p: any) => p.nome?.trim() === nome);
      if (idx >= 0) form.setValue(`customProducts.${idx}.prezzo`, prezzo, { shouldDirty: true });
    }
  }, [form]);

  // Handler per ripristinare il prezzo al valore di listino (rimuove l'override prezzo)
  const handleResetPrice = useCallback((key: string) => {
    if (!key.startsWith('cat:')) return;
    const id = key.slice(4);
    setCatalogOverrides(prev => {
      if (!prev[id] || prev[id].prezzo === undefined) return prev;
      const { prezzo, ...rest } = prev[id];
      const next = { ...prev };
      if (Object.keys(rest).length > 0) next[id] = rest;
      else delete next[id];
      return next;
    });
  }, []);

  // Handler per toggle Fisso/Extra (solo template variabili)
  const handleSelectableChange = useCallback((key: string, selectable: boolean) => {
    if (key.startsWith('cat:')) {
      const id = key.slice(4);
      setCatalogOverrides(prev => {
        const next = { ...prev };
        const cur = next[id] || {};
        next[id] = { ...cur, selectable };
        return next;
      });
    } else if (key.startsWith('cust:')) {
      const nome = key.slice(5);
      const products = form.getValues('customProducts');
      const idx = products.findIndex((p: any) => p.nome?.trim() === nome);
      if (idx >= 0) form.setValue(`customProducts.${idx}.selectable` as any, selectable, { shouldDirty: true });
    }
  }, [form]);

  // Lista sezioni usate (per autocomplete)
  const sectionSuggestions = useMemo<string[]>(() => {
    const seen = new Set<string>();
    mergedForOrderEditor.forEach(p => { if (p.sezione) seen.add(p.sezione); });
    return Array.from(seen).sort();
  }, [mergedForOrderEditor]);

  // Calculate totals — usa fields (da useFieldArray) invece di useWatch per customProducts
  // Applica override prezzo del template se presente
  const totaleCatalogo = catalogProductIds.reduce((sum, id) => {
    const ov = catalogOverrides[id];
    if (ov?.prezzo !== undefined) return sum + ov.prezzo;
    const product = catalogProducts.find((p) => p.id === id);
    return sum + (product?.prezzoFinale || product?.prezzo || 0);
  }, 0);

  const totaleCustom = fields
    .filter((p) => p.nome?.trim())
    .reduce((sum, p) => sum + (p.prezzo || 0), 0);

  const subtotale = totaleCatalogo + totaleCustom;

  // Usa utility condivisa per coerenza con QuoteBuilder
  const { totalAfterDiscount, discountAmount } = calculateQuoteTotals(
    subtotale,
    discountType,
    discountValue,
  );

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Merge catalog + custom products — applica override prezzo/selectable del template
      const catalogQuoteProducts: QuoteProduct[] = data.catalogProductIds.map(
        (id) => {
          const product = catalogProducts.find((p) => p.id === id);
          if (!product) throw new Error(`Prodotto ${id} non trovato`);
          const qp = catalogProductToQuoteProduct(product, data.type, catalogOverrides[id]);
          const sezione = catalogProductSections[id];
          if (sezione) (qp as any).sezione = sezione;
          return qp;
        },
      );

      const customQuoteProducts: QuoteProduct[] = data.customProducts
        .filter((p) => p.nome.trim())
        .map((p) => {
          // Rispetta selectable esplicito dal form, altrimenti deriva da quoteType
          const selectable = (p as any).selectable !== undefined
            ? !!(p as any).selectable
            : data.type === "variabile";
          const qp: QuoteProduct = {
            nome: p.nome,
            descrizione: p.descrizione,
            prezzo: p.prezzo,
            selectable,
            numeroFoto: p.numeroFoto,
            categoria: p.categoria,
            ...((p as any).sezione ? { sezione: (p as any).sezione } : {}),
          };
          // Prodotti non selezionabili (Fisso) sono sempre inclusi
          if (!selectable) qp.selected = true;
          return qp;
        });

      // Applica l'ordine scelto dall'admin tramite ProductOrderEditor
      const catalogMap = new Map(
        data.catalogProductIds.map((id) => [`cat:${id}`, catalogQuoteProducts.find((_, i) => data.catalogProductIds[i] === id)!])
      );
      const customMap = new Map(
        data.customProducts.filter((p) => p.nome.trim()).map((p, i) => [`cust:${p.nome.trim()}`, customQuoteProducts[i]])
      );
      let allProducts: QuoteProduct[];
      if (productOrderKeys.length > 0) {
        const merged = new Map([...catalogMap, ...customMap]);
        allProducts = productOrderKeys.map((k) => merged.get(k)).filter((p): p is QuoteProduct => !!p);
        // Aggiungi eventuali prodotti non presenti nella lista ordine
        merged.forEach((p, k) => { if (!productOrderKeys.includes(k)) allProducts.push(p); });
      } else {
        allProducts = [...catalogQuoteProducts, ...customQuoteProducts];
      }

      // Valida sconto PRIMA di salvare
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        const subtotale = allProducts.reduce((sum, p) => sum + p.prezzo, 0);
        const discountValidation = validateDiscount(
          subtotale,
          data.discountType,
          data.discountValue,
        );
        if (!discountValidation.valid) {
          throw new Error(discountValidation.error);
        }
      }

      // Clausole di default
      const defaultClauses = [
        {
          text: "Il cliente accetta i termini e condizioni del servizio",
          required: true,
        },
      ];

      const templateData: any = {
        nome: data.nome,
        jobType: data.jobType,
        type: data.type,
        theme: data.theme,
        defaultProducts: allProducts,
        defaultClauses,
        attivo: data.attivo,
      };

      // Only include discount fields if they are actually defined
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        templateData.discountType = data.discountType;
        templateData.discountValue = data.discountValue;
      }

      // Include benefit rules only for variabile templates
      if (data.type === "variabile" && benefitRules.length > 0) {
        templateData.benefitRules = benefitRules;
      }

      return createQuoteTemplate(templateData, user!.uid);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-templates"] });
      toast({
        title: "Template creato!",
        description: "Il template è ora disponibile per creare preventivi",
      });
      form.reset();
      setCreateModalOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const catalogQuoteProducts: QuoteProduct[] = data.catalogProductIds.map(
        (prodId) => {
          const product = catalogProducts.find((p) => p.id === prodId);
          if (!product) throw new Error(`Prodotto ${prodId} non trovato`);
          const qp2 = catalogProductToQuoteProduct(product, data.type, catalogOverrides[prodId]);
          const sezione2 = catalogProductSections[prodId];
          if (sezione2) (qp2 as any).sezione = sezione2;
          return qp2;
        },
      );

      const customQuoteProducts: QuoteProduct[] = data.customProducts
        .filter((p) => p.nome.trim())
        .map((p) => {
          const selectable = (p as any).selectable !== undefined
            ? !!(p as any).selectable
            : data.type === "variabile";
          const qp: QuoteProduct = {
            nome: p.nome,
            descrizione: p.descrizione,
            prezzo: p.prezzo,
            selectable,
            numeroFoto: p.numeroFoto,
            categoria: p.categoria,
            ...((p as any).sezione ? { sezione: (p as any).sezione } : {}),
          };
          if (!selectable) qp.selected = true;
          return qp;
        });

      // Applica l'ordine scelto dall'admin tramite ProductOrderEditor
      const catalogMap2 = new Map(
        data.catalogProductIds.map((id) => [`cat:${id}`, catalogQuoteProducts.find((_, i) => data.catalogProductIds[i] === id)!])
      );
      const customMap2 = new Map(
        data.customProducts.filter((p) => p.nome.trim()).map((p, i) => [`cust:${p.nome.trim()}`, customQuoteProducts[i]])
      );
      let allProducts: QuoteProduct[];
      if (productOrderKeys.length > 0) {
        const merged2 = new Map([...catalogMap2, ...customMap2]);
        allProducts = productOrderKeys.map((k) => merged2.get(k)).filter((p): p is QuoteProduct => !!p);
        merged2.forEach((p, k) => { if (!productOrderKeys.includes(k)) allProducts.push(p); });
      } else {
        allProducts = [...catalogQuoteProducts, ...customQuoteProducts];
      }

      // Valida sconto PRIMA di salvare
      if (data.discountType !== undefined && data.discountValue !== undefined) {
        const subtotale = allProducts.reduce((sum, p) => sum + p.prezzo, 0);
        const discountValidation = validateDiscount(
          subtotale,
          data.discountType,
          data.discountValue,
        );
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
        defaultClauses: currentTemplate?.defaultClauses || [
          {
            text: "Il cliente accetta i termini e condizioni del servizio",
            required: true,
          },
        ],
        attivo: data.attivo,
      };

      if (data.discountType !== undefined && data.discountValue !== undefined) {
        updateData.discountType = data.discountType;
        updateData.discountValue = data.discountValue;
      } else {
        updateData.discountType = deleteField();
        updateData.discountValue = deleteField();
      }

      // Include benefit rules only for variabile templates
      if (data.type === "variabile" && benefitRules.length > 0) {
        updateData.benefitRules = benefitRules;
      } else {
        updateData.benefitRules = deleteField();
      }

      await updateQuoteTemplate(id, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-templates"] });
      toast({
        title: "Template aggiornato!",
        description: "Le modifiche sono state salvate",
      });
      setEditModalOpen(false);
      setCurrentTemplate(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteQuoteTemplate,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-templates"] });
      toast({
        title: "Template eliminato",
        description: "Il template è stato disattivato",
      });
      setDeleteTemplateId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Errore",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle active mutation
  const toggleMutation = useMutation({
    mutationFn: ({ id, attivo }: { id: string; attivo: boolean }) =>
      toggleTemplateActive(id, attivo),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-templates"] });
    },
  });

  // Reorder mutation
  const reorderMutation = useMutation({
    mutationFn: updateTemplatesOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quote-templates"] });
      toast({
        title: "Ordine salvato",
        description: "La nuova disposizione è stata salvata",
      });
    },
  });

  // Drag end handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = templates.findIndex((t) => t.id === active.id);
      const newIndex = templates.findIndex((t) => t.id === over.id);

      const newTemplates = arrayMove(templates, oldIndex, newIndex).map((t, idx) => ({ ...t, ordine: idx }));

      queryClient.setQueryData(["quote-templates"], newTemplates);

      reorderMutation.mutate(newTemplates.map(t => t.id));
    }
  };

  const onSubmit = (data: FormData) => {
    if (editModalOpen && currentTemplate) {
      // Edit mode
      updateMutation.mutate({ id: currentTemplate.id, data });
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
        <Button
          onClick={handleCreateTemplate}
          className="bg-sage hover:bg-dark-sage"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Template
        </Button>
      </div>

      {/* Templates Grid with Drag & Drop */}
      {templates.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground mb-4">Nessun template creato</p>
            <Button
              onClick={handleCreateTemplate}
              className="bg-sage hover:bg-dark-sage"
              data-testid="button-create-template"
            >
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
                  onEdit={() => handleEditTemplate(template as QuoteTemplate & { id: string })}
                  onDelete={() => setDeleteTemplateId(template.id)}
                  onToggle={(checked) =>
                    toggleMutation.mutate({
                      id: template.id,
                      attivo: checked,
                    })
                  }
                  onGenerateLink={() => handleGenerateLink(template as QuoteTemplate & { id: string })}
                  onCompilainStudio={() => {
                    setStudioForm({ nome: '', cognome: '', email: '', cellulare: '', nomeEvento: '', eventDate: '', dataNonDefinita: false });
                    setStudioModalTemplate(template as QuoteTemplate & { id: string });
                  }}
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
            setCurrentTemplate(null);
            setCatalogProductSections({});
            form.reset();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {editModalOpen
                ? "Modifica Template Preventivo"
                : "Crea Template Preventivo"}
            </DialogTitle>
            <DialogDescription>
              {editModalOpen
                ? "Modifica il template con nuovi prodotti e prezzi"
                : "Crea un template riutilizzabile con prodotti e prezzi preimpostati"}
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
                        <Input placeholder="es. Comunioni 2025" {...field} />
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
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleziona tipo...">
                              {field.value && jobTypes.length > 0 ? (
                                <span className="flex items-center gap-2">
                                  <JobTypeIcon slug={field.value} size="sm" />
                                  {
                                    jobTypes.find(
                                      (jt) => jt.slug === field.value,
                                    )?.nome
                                  }
                                </span>
                              ) : (
                                "Seleziona tipo..."
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent
                          position="popper"
                          sideOffset={4}
                          className="z-[9999]"
                        >
                          {jobTypes.length === 0 ? (
                            <SelectItem value="none" disabled>
                              Nessun tipo lavoro configurato
                            </SelectItem>
                          ) : (
                            jobTypes.map((jt) => (
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
                      <SelectContent
                        position="popper"
                        sideOffset={4}
                        className="z-[9999]"
                      >
                        <SelectItem value="fisso">
                          Fisso (prezzo totale)
                        </SelectItem>
                        <SelectItem value="variabile">
                          Variabile (cliente sceglie)
                        </SelectItem>
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
                  <h3 className="text-lg font-semibold">
                    Prodotti Custom (opzionale)
                  </h3>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      append({
                        nome: "",
                        descrizione: "",
                        prezzo: 0,
                        numeroFoto: 0,
                        categoria: "",
                      })
                    }
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
                            <Badge variant="outline">
                              Prodotto {index + 1}
                            </Badge>
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
                                    <Input
                                      placeholder="es. Album 30x30"
                                      {...field}
                                    />
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
                                      onChange={(e) =>
                                        field.onChange(
                                          parseFloat(e.target.value) || 0,
                                        )
                                      }
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

              {/* Sezione Ordine Prodotti */}
              {mergedForOrderEditor.length > 1 && (
                <div className="border rounded-lg p-4 bg-sage-50/30">
                  <h3 className="text-sm font-semibold text-sage-800 mb-3 flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-sage-500" />
                    Ordine di visualizzazione prodotti
                  </h3>
                  <p className="text-xs text-muted-foreground mb-3">
                    Trascina per definire l'ordine in cui i prodotti appariranno nel preventivo.
                  </p>
                  <ProductOrderEditor
                    onPriceChange={handlePriceChange}
                    onResetPrice={handleResetPrice}
                    onSelectableChange={handleSelectableChange}
                    showSelectableToggle={quoteType === 'variabile'}
                    products={mergedForOrderEditor}
                    orderKeys={productOrderKeys}
                    onOrderChange={setProductOrderKeys}
                    onSectionChange={handleSectionChange}
                    sectionSuggestions={sectionSuggestions}
                  />
                </div>
              )}

              {/* Sezione Benefici Inclusi - solo template variabili */}
              {quoteType === "variabile" && (() => {
                const allSelectableNames: string[] = [
                  ...catalogProductIds.map((id: string) => {
                    const p = catalogProducts.find((cp: any) => cp.id === id);
                    return p?.nome ?? "";
                  }).filter(Boolean),
                  ...fields.filter((p) => p.nome?.trim()).map((p) => p.nome),
                ];

                const addBenefitRule = () => {
                  const newRule: BenefitRule = {
                    id: nanoid(),
                    benefitProductNames: [],
                    enabled: true,
                    requiredProductNames: [],
                    minSelectableCount: undefined,
                  };
                  setBenefitRules(prev => [...prev, newRule]);
                  setExpandedBenefitRules(prev => new Set([...prev, newRule.id]));
                };

                const updateRule = (id: string, patch: Partial<BenefitRule>) => {
                  setBenefitRules(prev =>
                    prev.map(r => r.id === id ? { ...r, ...patch } : r)
                  );
                };

                const removeRule = (id: string) => {
                  setBenefitRules(prev => prev.filter(r => r.id !== id));
                };

                const toggleRuleExpand = (id: string) => {
                  setExpandedBenefitRules(prev => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id); else next.add(id);
                    return next;
                  });
                };

                const previewStates = benefitRules.length > 0
                  ? computeBenefitStates(benefitRules, [], allSelectableNames)
                  : [];

                return (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <Gift className="w-5 h-5 text-emerald-600" />
                          3. Benefici Inclusi Automatici
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Si attivano automaticamente quando il cliente seleziona determinate combinazioni di servizi.
                        </p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={addBenefitRule}
                        className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                        <Plus className="w-4 h-4" />
                        Aggiungi benefit
                      </Button>
                    </div>

                    {benefitRules.length === 0 && (
                      <Card className="border-dashed border-emerald-200 bg-emerald-50/40">
                        <CardContent className="py-8 text-center text-sm text-muted-foreground">
                          <Gift className="w-8 h-8 mx-auto mb-2 text-emerald-300" />
                          Nessun benefit configurato. Aggiungine uno per mostrare ai clienti cosa possono sbloccare.
                        </CardContent>
                      </Card>
                    )}

                    <div className="space-y-3">
                      {benefitRules.map(rule => {
                        const isExpanded = expandedBenefitRules.has(rule.id);
                        const preview = previewStates.find(s => s.rule.id === rule.id);
                        return (
                          <Card key={rule.id} className={`border transition-colors ${rule.enabled ? "border-emerald-200 bg-emerald-50/30" : "border-gray-200 bg-gray-50 opacity-60"}`}>
                            <CardHeader className="py-3 px-4">
                              <div className="flex items-center gap-3">
                                <button type="button" onClick={() => toggleRuleExpand(rule.id)}
                                  className="flex-1 flex items-center gap-3 text-left min-w-0">
                                  {isExpanded
                                    ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                    : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                  }
                                  <span className="font-medium truncate text-sm">
                                    {(rule.benefitProductNames ?? []).length > 0
                                      ? <><span className="text-emerald-700">INCLUSO:</span> {rule.benefitProductNames.join(', ')}</>
                                      : <span className="text-muted-foreground italic">Nessun prodotto selezionato</span>
                                    }
                                  </span>
                                  {(rule.benefitProductNames ?? []).length > 0 && (
                                    <Badge className="flex-shrink-0 text-xs bg-emerald-100 text-emerald-700 border-0">
                                      {rule.benefitProductNames.length} {rule.benefitProductNames.length === 1 ? 'servizio incluso' : 'servizi inclusi'}
                                    </Badge>
                                  )}
                                  {/* Warning: regola senza condizioni → sempre sbloccata */}
                                  {(rule.benefitProductNames ?? []).length > 0 &&
                                    (rule.requiredProductNames ?? []).length === 0 &&
                                    !rule.minSelectableCount && (
                                    <Badge className="flex-shrink-0 text-xs bg-amber-100 text-amber-700 border border-amber-300">
                                      ⚠ Sempre attivo
                                    </Badge>
                                  )}
                                  {(rule.requiredProductNames ?? []).length > 0 && (
                                    <Badge variant="outline" className="flex-shrink-0 text-xs text-gray-500 border-gray-300">
                                      {(rule.requiredProductNames ?? []).length} trigger
                                    </Badge>
                                  )}
                                </button>
                                <Switch
                                  checked={rule.enabled}
                                  onCheckedChange={(v) => updateRule(rule.id, { enabled: v })}
                                  aria-label="Attiva benefit"
                                />
                                <Button type="button" variant="ghost" size="sm"
                                  onClick={() => removeRule(rule.id)}
                                  className="text-destructive hover:bg-destructive/10 flex-shrink-0 h-7 w-7 p-0">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </CardHeader>

                            {isExpanded && (
                              <CardContent className="px-4 pb-4 space-y-4 border-t border-emerald-100 pt-4">

                                {/* Servizi Inclusi */}
                                <div className="border border-emerald-300 rounded-lg p-3 space-y-2 bg-emerald-50/50">
                                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                                    <Gift className="w-3.5 h-3.5" />
                                    Servizi Inclusi
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Seleziona uno o più prodotti del template che diventano <strong>Servizi Inclusi</strong> (€0) quando si verificano le condizioni. Puoi selezionarne quanti vuoi.
                                  </p>
                                  {allSelectableNames.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                      {allSelectableNames.map(name => {
                                        const isSelected = (rule.benefitProductNames ?? []).includes(name);
                                        return (
                                          <button
                                            key={name}
                                            type="button"
                                            onClick={() => {
                                              const current = rule.benefitProductNames ?? [];
                                              updateRule(rule.id, {
                                                benefitProductNames: isSelected
                                                  ? current.filter(n => n !== name)
                                                  : [...current, name]
                                              });
                                            }}
                                            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                                              isSelected
                                                ? "bg-emerald-600 text-white border-emerald-600"
                                                : "bg-white text-gray-700 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50"
                                            }`}
                                          >
                                            {isSelected && "✓ "}{name}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">
                                      Aggiungi prodotti al template per selezionarne come Servizi Inclusi.
                                    </p>
                                  )}
                                </div>

                                {/* Condizioni di attivazione */}
                                <div className="border border-gray-200 rounded-lg p-3 space-y-3 bg-white">
                                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                                    Condizioni di attivazione
                                  </p>

                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Prodotti trigger richiesti (tutti)</Label>
                                    {allSelectableNames.filter(n => !(rule.benefitProductNames ?? []).includes(n)).length > 0 ? (
                                      <div className="flex flex-wrap gap-2">
                                        {allSelectableNames
                                          .filter(name => !(rule.benefitProductNames ?? []).includes(name))
                                          .map(name => {
                                            const isRequired = (rule.requiredProductNames ?? []).includes(name);
                                            return (
                                              <button
                                                key={name}
                                                type="button"
                                                onClick={() => {
                                                  const current = rule.requiredProductNames ?? [];
                                                  updateRule(rule.id, {
                                                    requiredProductNames: isRequired
                                                      ? current.filter(n => n !== name)
                                                      : [...current, name]
                                                  });
                                                }}
                                                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                                                  isRequired
                                                    ? "bg-blue-600 text-white border-blue-600"
                                                    : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                                                }`}
                                              >
                                                {name}
                                              </button>
                                            );
                                          })}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground italic">
                                        {allSelectableNames.length === 0
                                          ? "Aggiungi prodotti al template per impostare i trigger."
                                          : "Aggiungi altri prodotti al template oltre ai Servizi Inclusi."}
                                      </p>
                                    )}
                                    {(rule.requiredProductNames ?? []).length > 0 && (
                                      <p className="text-xs text-blue-700">
                                        Trigger: {rule.requiredProductNames!.join(", ")}
                                      </p>
                                    )}
                                  </div>

                                  <Separator className="my-1" />

                                  <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">OPPURE: numero minimo servizi selezionati</Label>
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        min={1}
                                        placeholder="Es. 5"
                                        className="w-28"
                                        value={rule.minSelectableCount ?? ""}
                                        onChange={e => updateRule(rule.id, {
                                          minSelectableCount: e.target.value ? parseInt(e.target.value) : undefined
                                        })}
                                      />
                                      <span className="text-xs text-muted-foreground">servizi selezionati</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Si attiva quando il cliente seleziona almeno N servizi (qualsiasi combinazione).
                                    </p>
                                  </div>
                                </div>

                                {(rule.benefitProductNames ?? []).length > 0 && preview && (
                                  <div className="text-xs rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-muted-foreground">
                                    <span className="font-medium">Anteprima messaggio (0 servizi selezionati):</span>{" "}
                                    {preview.feedbackMessage}
                                  </div>
                                )}
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

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
                        <Select
                          value={field.value || "none"}
                          onValueChange={(val) => {
                            if (val === "none") {
                              field.onChange(undefined);
                              form.setValue("discountValue", undefined);
                            } else {
                              field.onChange(val);
                            }
                          }}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent
                            position="popper"
                            sideOffset={4}
                            className="z-[9999]"
                          >
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
                            Valore Sconto{" "}
                            {discountType === "amount" ? "(€)" : "(%)"}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={
                                discountType === "amount" ? "0.00" : "0"
                              }
                              {...field}
                              value={field.value ?? ""}
                              onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "" || raw === ".") {
                                  field.onChange(0);
                                  return;
                                }
                                const parsed = parseFloat(raw);
                                if (!Number.isNaN(parsed)) {
                                  field.onChange(parsed);
                                }
                              }}
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
                      <span className="font-medium">
                        €{subtotale.toFixed(2)}
                      </span>
                    </div>

                    {discountType && discountValue > 0 && (
                      <div className="flex items-center justify-between text-sm text-orange-600">
                        <span>
                          Sconto{" "}
                          {discountType === "percent"
                            ? `(${discountValue}%)`
                            : ""}
                        </span>
                        <span>
                          -€
                          {discountType === "amount"
                            ? discountValue.toFixed(2)
                            : ((subtotale * discountValue) / 100).toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-green-200">
                      <span className="text-lg font-semibold">
                        Totale Template
                      </span>
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
                    setCurrentTemplate(null);
                    form.reset();
                  }}
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  className="bg-sage hover:bg-dark-sage"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  {editModalOpen ? "Salva Modifiche" : "Crea Template"}
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
              onClick={() =>
                deleteTemplateId && deleteMutation.mutate(deleteTemplateId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Compila in Studio Modal */}
      <Dialog open={!!studioModalTemplate} onOpenChange={(open) => { if (!open) setStudioModalTemplate(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-sage-600" />
              Compila in Studio
            </DialogTitle>
            <DialogDescription>
              Crea subito il preventivo <strong>"{studioModalTemplate?.nome}"</strong> insieme al cliente. Il job e il modulo vengono creati istantaneamente — nessun link, nessun OTP.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Nome *</label>
                <Input
                  value={studioForm.nome}
                  onChange={e => setStudioForm(f => ({ ...f, nome: e.target.value }))}
                  placeholder="Mario"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Cognome *</label>
                <Input
                  value={studioForm.cognome}
                  onChange={e => setStudioForm(f => ({ ...f, cognome: e.target.value }))}
                  placeholder="Rossi"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={studioForm.email}
                onChange={e => setStudioForm(f => ({ ...f, email: e.target.value }))}
                placeholder="mario.rossi@email.com (opzionale)"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Telefono</label>
              <Input
                value={studioForm.cellulare}
                onChange={e => setStudioForm(f => ({ ...f, cellulare: e.target.value }))}
                placeholder="+39 333 000 0000 (opzionale)"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Nome Evento *</label>
              <Input
                value={studioForm.nomeEvento}
                onChange={e => setStudioForm(f => ({ ...f, nomeEvento: e.target.value }))}
                placeholder="es. Matrimonio Mario e Anna"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dataNonDefinita"
                  checked={studioForm.dataNonDefinita}
                  onCheckedChange={(checked) => setStudioForm(f => ({ ...f, dataNonDefinita: !!checked, eventDate: '' }))}
                />
                <label htmlFor="dataNonDefinita" className="text-sm cursor-pointer">Data da definire</label>
              </div>
              {!studioForm.dataNonDefinita && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Data Evento</label>
                  <Input
                    type="date"
                    value={studioForm.eventDate}
                    onChange={e => setStudioForm(f => ({ ...f, eventDate: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setStudioModalTemplate(null)} disabled={studioSubmitting}>
              Annulla
            </Button>
            <Button
              className="flex-1 bg-sage-600 hover:bg-sage-700 text-white"
              onClick={handleCompilainStudio}
              disabled={studioSubmitting || !studioForm.nome.trim() || !studioForm.cognome.trim() || !studioForm.nomeEvento.trim()}
            >
              {studioSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creazione…</> : <><Users className="h-4 w-4 mr-2" /> Crea e Apri Job</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

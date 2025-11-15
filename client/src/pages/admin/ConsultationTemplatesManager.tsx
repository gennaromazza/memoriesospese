/**
 * Consultation Templates Manager - Admin CRUD per template consulenze
 */

import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  CONSULTATION_KEYS,
} from "@/lib/consultations";
import type {
  ConsultationTemplate,
  InsertConsultationTemplate,
  UpdateConsultationTemplate,
  ConsultationJobField,
  ConsultationWorkingHours,
} from "@shared/consultation-types";
import { DEFAULT_CONSULTATION_HOURS } from "@shared/consultation-types";
import { Button } from "@/components/ui/button";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Edit,
  Trash2,
  Power,
  PowerOff,
  Clock,
  FileText,
  ChevronDown,
  ChevronRight,
  Upload,
  X,
  CalendarX,
  Image as ImageIcon,
  Copy,
  RefreshCw,
  Database,
} from "lucide-react";
import { getJobTypes } from "@/lib/job-types";
import type { JobType as JobTypeDoc } from "@shared/job-types";

export default function ConsultationTemplatesManager() {
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<ConsultationTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [openJobTypes, setOpenJobTypes] = useState<string[]>([]);
  
  // Migration state
  const [migrationDialogOpen, setMigrationDialogOpen] = useState(false);
  const [migrationReport, setMigrationReport] = useState<any>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<InsertConsultationTemplate>>(
    {
      nome: "",
      jobType: "",
      durataMinuti: 60,
      descrizione: "",
      jobDataFields: [],
      customWorkingHours: undefined,
      imageUrls: [],
      attiva: true,
      ordine: 0,
    },
  );
  
  // Upload state
  const [uploadingImage, setUploadingImage] = useState(false);

  // Ref for auto-scroll to new field
  const fieldsContainerRef = useRef<HTMLDivElement>(null);
  const lastFieldCountRef = useRef(0);

  // Auth state
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const authReady = !authLoading && !!user;

  // Queries
  const { data: templates = [], isLoading } = useTemplates(authReady);
  const { data: jobTypes = [] } = useQuery<JobTypeDoc[]>({
    queryKey: ["jobTypes"],
    queryFn: getJobTypes,
  });

  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate();
  const deleteMutation = useDeleteTemplate();

  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormData({
      nome: "",
      jobType: "",
      durataMinuti: 60,
      descrizione: "",
      jobDataFields: [],
      customWorkingHours: JSON.parse(JSON.stringify(DEFAULT_CONSULTATION_HOURS)), // Deep clone per evitare riferimenti
      imageUrls: [],
      attiva: true,
      ordine: 0,
    });
    setDialogOpen(true);
  };

  const handleOpenEdit = (template: ConsultationTemplate) => {
    setEditingTemplate(template);
    setFormData({
      nome: template.nome,
      jobType: template.jobType,
      durataMinuti: template.durataMinuti,
      descrizione: template.descrizione,
      jobDataFields: template.jobDataFields || [],
      customWorkingHours: template.customWorkingHours,
      imageUrls: template.imageUrls || [],
      attiva: template.attiva,
      ordine: template.ordine || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!formData.nome || !formData.jobType || !formData.descrizione) {
        toast({
          variant: "destructive",
          title: "Campi obbligatori mancanti",
          description: "Nome, tipo lavoro e descrizione sono obbligatori",
        });
        return;
      }

      // 🔍 DEBUG: Log customWorkingHours prima dell'invio al backend
      console.log('[handleSave] 🔍 DEBUG - formData.customWorkingHours:', formData.customWorkingHours);
      if (formData.customWorkingHours) {
        console.log('[handleSave] 🔍 DEBUG - customWorkingHours length:', formData.customWorkingHours.length);
        const mondayConfig = formData.customWorkingHours.find(h => h.giornoSettimana === 1);
        console.log('[handleSave] 🔍 DEBUG - Monday config (giornoSettimana: 1):', mondayConfig);
      }

      if (editingTemplate) {
        await updateMutation.mutateAsync({
          id: editingTemplate.id,
          data: formData as UpdateConsultationTemplate,
        });
        toast({
          title: "Template aggiornato",
          description: `Template "${formData.nome}" aggiornato con successo`,
        });
      } else {
        await createMutation.mutateAsync(
          formData as InsertConsultationTemplate,
        );
        toast({
          title: "Template creato",
          description: `Template "${formData.nome}" creato con successo`,
        });
      }

      setDialogOpen(false);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Operazione fallita";
      toast({
        variant: "destructive",
        title: "Errore",
        description: errorMessage,
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;

    try {
      await deleteMutation.mutateAsync(deleteConfirmId);
      toast({
        title: "Template eliminato",
        description: "Template eliminato con successo",
      });
      setDeleteConfirmId(null);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Eliminazione fallita";
      toast({
        variant: "destructive",
        title: "Errore",
        description: errorMessage,
      });
    }
  };

  const handleToggleActive = async (template: ConsultationTemplate) => {
    try {
      await updateMutation.mutateAsync({
        id: template.id,
        data: { attiva: !template.attiva },
      });
      toast({
        title: template.attiva ? "Template disattivato" : "Template attivato",
        description: `"${template.nome}" è ora ${template.attiva ? "inattivo" : "attivo"}`,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Operazione fallita";
      toast({
        variant: "destructive",
        title: "Errore",
        description: errorMessage,
      });
    }
  };

  const handleDuplicate = async (template: ConsultationTemplate) => {
    try {
      const duplicatedTemplate: InsertConsultationTemplate = {
        nome: `(Copia) ${template.nome}`,
        jobType: template.jobType,
        durataMinuti: template.durataMinuti,
        descrizione: template.descrizione,
        jobDataFields: JSON.parse(JSON.stringify(template.jobDataFields || [])), // Deep clone
        customWorkingHours: template.customWorkingHours 
          ? JSON.parse(JSON.stringify(template.customWorkingHours)) // Deep clone
          : JSON.parse(JSON.stringify(DEFAULT_CONSULTATION_HOURS)), // Fallback con default
        imageUrls: [...(template.imageUrls || [])], // Shallow ok per strings
        attiva: false,
        ordine: (template.ordine || 0) + 1,
      };

      await createMutation.mutateAsync(duplicatedTemplate);
      
      toast({
        title: "Template duplicato",
        description: `"${duplicatedTemplate.nome}" creato con successo`,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Duplicazione fallita";
      toast({
        variant: "destructive",
        title: "Errore",
        description: errorMessage,
      });
    }
  };

  // Migration handlers
  const handleOpenMigration = async () => {
    setIsMigrating(true);
    setMigrationReport(null);
    
    try {
      // Esegui dry-run per preview
      const token = await user?.getIdToken();
      const response = await fetch('/api/consultations/migrate-initialize-working-hours?dryRun=true&syncAll=true', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Errore caricamento preview migrazione');
      }
      
      const data = await response.json();
      setMigrationReport(data.report);
      setMigrationDialogOpen(true);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Errore preview migrazione';
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: errorMessage
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const handleExecuteMigration = async () => {
    setIsMigrating(true);
    
    try {
      const token = await user?.getIdToken();
      const response = await fetch('/api/consultations/migrate-initialize-working-hours?dryRun=false&syncAll=true', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Errore esecuzione migrazione');
      }
      
      const data = await response.json();
      
      toast({
        title: 'Migrazione completata',
        description: `${data.report.initialized} template inizializzati, ${data.report.syncedOnly} sincronizzati`,
      });
      
      // Ricarica template
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.templates() });
      setMigrationDialogOpen(false);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Migrazione fallita';
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: errorMessage
      });
    } finally {
      setIsMigrating(false);
    }
  };

  const toggleRowExpanded = (templateId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) {
        next.delete(templateId);
      } else {
        next.add(templateId);
      }
      return next;
    });
  };

  const addJobDataField = () => {
    const fieldNumber = (formData.jobDataFields?.length || 0) + 1;
    setFormData((prev) => ({
      ...prev,
      jobDataFields: [
        ...(prev.jobDataFields || []),
        {
          fieldKey: `campo_${fieldNumber}`,
          label: `Nuovo Campo ${fieldNumber}`,
          type: "text" as const,
          required: false,
          placeholder: "",
          helperText: "",
        },
      ],
    }));
  };

  // Auto-scroll to bottom when new field is added
  useEffect(() => {
    const currentCount = formData.jobDataFields?.length || 0;
    if (currentCount > lastFieldCountRef.current && fieldsContainerRef.current) {
      setTimeout(() => {
        fieldsContainerRef.current?.scrollTo({
          top: fieldsContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 100);
    }
    lastFieldCountRef.current = currentCount;
  }, [formData.jobDataFields?.length]);

  const updateJobDataField = (
    index: number,
    updates: Partial<ConsultationJobField>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      jobDataFields: prev.jobDataFields?.map((field, i) =>
        i === index
          ? ({ ...field, ...updates } as ConsultationJobField)
          : field,
      ),
    }));
  };

  const removeJobDataField = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      jobDataFields: prev.jobDataFields?.filter((_, i) => i !== index),
    }));
  };

  // Availability handlers (excludedDays removed - now managed via customWorkingHours)

  // Image upload handlers
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingTemplate) return;

    // Client validation
    const currentImages = formData.imageUrls || [];
    if (currentImages.length >= 10) {
      toast({
        variant: "destructive",
        title: "Limite raggiunto",
        description: "Massimo 10 immagini per template",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File troppo grande",
        description: "Dimensione massima 5MB per immagine",
      });
      return;
    }

    setUploadingImage(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("image", file);

      const token = await user?.getIdToken();
      const response = await fetch(
        `/api/consultations/templates/${editingTemplate.id}/upload-image`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formDataUpload,
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload fallito");
      }

      const data = await response.json();

      setFormData((prev) => ({
        ...prev,
        imageUrls: [...(prev.imageUrls || []), data.imageUrl],
      }));

      // Invalida cache template
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.templates() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.template(editingTemplate.id) });

      toast({
        title: "Immagine caricata",
        description: "Immagine aggiunta con successo",
      });

      // Reset input
      e.target.value = "";
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload fallito";
      toast({
        variant: "destructive",
        title: "Errore upload",
        description: errorMessage,
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async (imageUrl: string) => {
    if (!editingTemplate) return;

    try {
      const token = await user?.getIdToken();
      const response = await fetch(
        `/api/consultations/templates/${editingTemplate.id}/images`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ imageUrl }),
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Eliminazione fallita");
      }

      setFormData((prev) => ({
        ...prev,
        imageUrls: (prev.imageUrls || []).filter((url) => url !== imageUrl),
      }));

      // Invalida cache template
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.templates() });
      queryClient.invalidateQueries({ queryKey: CONSULTATION_KEYS.template(editingTemplate.id) });

      toast({
        title: "Immagine eliminata",
        description: "Immagine rimossa con successo",
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Eliminazione fallita";
      toast({
        variant: "destructive",
        title: "Errore",
        description: errorMessage,
      });
    }
  };

  // Colori e icone per categoria - Palette pastello October Mist
  const categoryStyles: Record<string, { 
    color: string; 
    bgLight: string; 
    bgDark: string; 
    bgCard: string;
    borderColor: string;
    icon: string;
    badgeBg: string;
    badgeText: string;
  }> = {
    'battesimo': { 
      color: 'text-blue-gray', // Usa il blu-grigio della palette
      bgLight: 'bg-gradient-to-br from-slate-50/80 to-blue-50/60', 
      bgDark: 'bg-slate-100/60',
      bgCard: 'bg-off-white',
      borderColor: 'border-slate-300',
      icon: '👶',
      badgeBg: 'bg-slate-100',
      badgeText: 'text-slate-700'
    },
    'comunione': { 
      color: 'text-dark-sage', // Verde salvia scuro
      bgLight: 'bg-gradient-to-br from-green-50/60 to-mint/40', 
      bgDark: 'bg-sage/30',
      bgCard: 'bg-off-white',
      borderColor: 'border-sage',
      icon: '⛪',
      badgeBg: 'bg-mint',
      badgeText: 'text-dark-sage'
    },
    'matrimonio': { 
      color: 'text-rose-800', // Rosa più tenue
      bgLight: 'bg-gradient-to-br from-rose-50/60 to-pink-50/50', 
      bgDark: 'bg-rose-100/50',
      bgCard: 'bg-off-white',
      borderColor: 'border-rose-200',
      icon: '💒',
      badgeBg: 'bg-rose-100',
      badgeText: 'text-rose-700'
    },
    'prima-comunione': { 
      color: 'text-amber-700', // Ambra/beige caldo
      bgLight: 'bg-gradient-to-br from-amber-50/50 to-cream/60', 
      bgDark: 'bg-beige/60',
      bgCard: 'bg-off-white',
      borderColor: 'border-beige',
      icon: '🕊️',
      badgeBg: 'bg-cream',
      badgeText: 'text-amber-800'
    },
  };

  // Raggruppa template per jobType
  const templatesByJobType = React.useMemo(() => {
    const map = new Map<string, ConsultationTemplate[]>();
    
    templates.forEach((template) => {
      const jobType = template.jobType;
      if (!map.has(jobType)) {
        map.set(jobType, []);
      }
      map.get(jobType)!.push(template);
    });
    
    // Ordina i template dentro ogni gruppo per ordine
    map.forEach((templates) => {
      templates.sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
    });
    
    return map;
  }, [templates]);
  
  // Ordina i jobTypes alfabeticamente
  const sortedJobTypes = React.useMemo(() => {
    return Array.from(templatesByJobType.keys()).sort((a, b) => 
      a.localeCompare(b)
    );
  }, [templatesByJobType]);
  
  // Aggiorna accordion state quando i jobTypes vengono caricati
  useEffect(() => {
    if (sortedJobTypes.length > 0 && openJobTypes.length === 0) {
      setOpenJobTypes(sortedJobTypes);
    }
  }, [sortedJobTypes, openJobTypes.length]);

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            Template Consulenze
          </h1>
          <p className="text-gray-600 mt-1">
            Gestisci i template di consulenza per ogni tipo di lavoro
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={handleOpenMigration}
            variant="outline"
            disabled={isMigrating}
            data-testid="button-migrate-templates"
          >
            {isMigrating ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Database className="w-4 h-4 mr-2" />
            )}
            Migra Template
          </Button>
          <Button
            onClick={handleOpenCreate}
            className="bg-terracotta hover:bg-terracotta/90 text-white"
            data-testid="button-create-template"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Attivi</CardTitle>
          <CardDescription>
            {templates.filter((t) => t.attiva).length} template attivi su{" "}
            {templates.length} totali
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Caricamento...</div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nessun template creato</p>
              <Button
                variant="outline"
                onClick={handleOpenCreate}
                className="mt-4"
                data-testid="button-create-first-template"
              >
                Crea il primo template
              </Button>
            </div>
          ) : (
            <Accordion type="multiple" value={openJobTypes} onValueChange={setOpenJobTypes} className="w-full space-y-6">
              {sortedJobTypes.map((jobType) => {
                const jobTypeTemplates = templatesByJobType.get(jobType) || [];
                const jobTypeName = jobTypes.find((jt: JobTypeDoc) => jt.slug === jobType)?.nome || jobType;
                const activeCount = jobTypeTemplates.filter(t => t.attiva).length;
                const style = categoryStyles[jobType] || { 
                  color: 'text-gray-700', 
                  bgLight: 'bg-gray-50/50', 
                  bgDark: 'bg-gray-100/70',
                  bgCard: 'bg-white',
                  borderColor: 'border-gray-300',
                  icon: '📋',
                  badgeBg: 'bg-gray-100',
                  badgeText: 'text-gray-800'
                };
                
                return (
                  <AccordionItem 
                    key={jobType} 
                    value={jobType} 
                    className={`border-2 border-l-[6px] rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow ${style.borderColor} ${style.bgLight}`}
                  >
                    <AccordionTrigger className={`hover:no-underline py-6 px-6 hover:${style.bgDark} transition-all duration-200`}>
                      <div className="flex items-center gap-4 text-left w-full">
                        <div className={`text-4xl flex-shrink-0 p-3 rounded-full ${style.bgDark}`}>
                          {style.icon}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-1">
                          <h3 className={`text-lg font-bold ${style.color}`}>
                            {jobTypeName}
                          </h3>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge 
                              className={`${style.badgeBg} ${style.badgeText} border-0 font-semibold`}
                            >
                              {activeCount}/{jobTypeTemplates.length} attivi
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${style.borderColor}`}
                            >
                              {jobTypeTemplates.length} template totali
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className={`${style.bgLight} pt-2 pb-6`}>
                      <div className={`${style.bgCard} rounded-lg overflow-hidden border-2 ${style.borderColor} shadow-sm mx-4 mb-2`}>
                        <Table>
                          <TableHeader>
                            <TableRow className={`${style.bgDark} border-b-2 ${style.borderColor}`}>
                              <TableHead className="w-12"></TableHead>
                              <TableHead className={`font-bold ${style.color}`}>Nome Template</TableHead>
                              <TableHead className={`font-bold ${style.color}`}>Durata</TableHead>
                              <TableHead className={`font-bold ${style.color}`}>Campi Job</TableHead>
                              <TableHead className={`font-bold ${style.color}`}>Stato</TableHead>
                              <TableHead className={`text-right font-bold ${style.color}`}>Azioni</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                          {jobTypeTemplates.map((template, idx) => (
                  <React.Fragment key={template.id}>
                    <TableRow
                      className={`cursor-pointer transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : style.bgLight
                      } hover:${style.bgDark}`}
                      data-testid={`row-template-${template.id}`}
                    >
                      <TableCell
                        onClick={() => toggleRowExpanded(template.id)}
                        data-testid={`button-expand-${template.id}`}
                        className="py-4"
                      >
                        {expandedRows.has(template.id) ? (
                          <ChevronDown className={`w-5 h-5 ${style.color}`} />
                        ) : (
                          <ChevronRight className={`w-5 h-5 ${style.color}`} />
                        )}
                      </TableCell>
                      <TableCell className={`font-semibold ${style.color} py-4`}>
                        {template.nome}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className={`flex items-center gap-2 text-sm font-medium ${style.color}`}>
                          <Clock className="w-4 h-4" />
                          {template.durataMinuti} min
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge className={`${style.badgeBg} ${style.badgeText} border-0`}>
                          {template.jobDataFields?.length || 0} campi
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        {template.attiva ? (
                          <Badge className="bg-green-100 text-green-800 border-0 font-semibold">
                            ✓ Attivo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-gray-100 text-gray-600 border-gray-300"
                          >
                            ✕ Inattivo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicate(template);
                            }}
                            data-testid={`button-duplicate-${template.id}`}
                            title="Duplica template"
                          >
                            <Copy className="w-4 h-4 text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleActive(template);
                            }}
                            data-testid={`button-toggle-${template.id}`}
                          >
                            {template.attiva ? (
                              <PowerOff className="w-4 h-4 text-orange-600" />
                            ) : (
                              <Power className="w-4 h-4 text-green-600" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEdit(template);
                            }}
                            data-testid={`button-edit-${template.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmId(template.id);
                            }}
                            data-testid={`button-delete-${template.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(template.id) && (
                      <TableRow className={`${style.bgDark} border-t-2 ${style.borderColor}`}>
                        <TableCell colSpan={6} className="py-6">
                          <div className="pl-8 space-y-4">
                            <div className={`p-4 rounded-lg border-l-4 ${style.borderColor} bg-white`}>
                              <p className={`text-sm font-semibold ${style.color} mb-1`}>
                                Descrizione:
                              </p>
                              <p className="text-sm text-gray-700">
                                {template.descrizione}
                              </p>
                            </div>
                            
                            {template.jobDataFields &&
                              template.jobDataFields.length > 0 && (
                                <div className={`p-4 rounded-lg border-l-4 ${style.borderColor} bg-white`}>
                                  <p className={`text-sm font-semibold ${style.color} mb-3`}>
                                    Campi Job Data ({template.jobDataFields.length}):
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {template.jobDataFields.map(
                                      (
                                        field: ConsultationJobField,
                                        idx: number,
                                      ) => (
                                        <div
                                          key={idx}
                                          className={`text-sm flex items-center gap-2 p-2 rounded ${style.bgLight}`}
                                        >
                                          <Badge
                                            className={`${style.badgeBg} ${style.badgeText} border-0 text-xs`}
                                          >
                                            {field.type}
                                          </Badge>
                                          <span className={`font-medium ${style.color}`}>
                                            {field.label}
                                          </span>
                                          {field.required && (
                                            <span className="text-red-600 text-xs font-bold">
                                              *
                                            </span>
                                          )}
                                          {field.placeholder && (
                                            <span className="text-gray-500 text-xs italic">
                                              ({field.placeholder})
                                            </span>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </div>
                              )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] w-full flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 border-b shrink-0">
            <DialogTitle className="text-2xl font-playfair">
              {editingTemplate ? "Modifica Template" : "Nuovo Template"}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Configura il template di consulenza con campi job dinamici
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 border-b flex justify-end gap-3 shrink-0">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
              className="min-w-[100px]"
            >
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-blue-gray hover:bg-dark-sage text-white min-w-[100px]"
              data-testid="button-save"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Salvataggio..."
                : "Salva"}
            </Button>
          </div>

          <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="mx-6 mt-4 shrink-0">
              <TabsTrigger value="general">Generale</TabsTrigger>
              <TabsTrigger value="availability">Disponibilità</TabsTrigger>
              <TabsTrigger value="images">Immagini</TabsTrigger>
              <TabsTrigger value="fields">Campi Job</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex-1 overflow-y-auto px-6 space-y-6 py-6 min-h-0">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome Template *</Label>
                  <Input
                    id="nome"
                    value={formData.nome || ""}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, nome: e.target.value }))
                    }
                    placeholder="es. Consulenza Pre-Matrimonio"
                    data-testid="input-nome"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobType">Tipo Lavoro *</Label>
                  <Select
                    value={formData.jobType || ""}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, jobType: value }))
                    }
                  >
                    <SelectTrigger id="jobType" data-testid="select-jobType">
                      <SelectValue placeholder="Seleziona tipo lavoro" />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map((jt: JobTypeDoc) => (
                        <SelectItem key={jt.slug} value={jt.slug}>
                          {jt.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descrizione">Descrizione *</Label>
                <Textarea
                  id="descrizione"
                  value={formData.descrizione || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      descrizione: e.target.value,
                    }))
                  }
                  placeholder="Breve descrizione della consulenza"
                  rows={3}
                  data-testid="input-descrizione"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="durata">Durata (minuti) *</Label>
                  <Input
                    id="durata"
                    type="number"
                    min="15"
                    max="480"
                    step="15"
                    value={formData.durataMinuti || 60}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        durataMinuti: parseInt(e.target.value),
                      }))
                    }
                    data-testid="input-durata"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ordine">Ordine</Label>
                  <Input
                    id="ordine"
                    type="number"
                    value={formData.ordine || 0}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        ordine: parseInt(e.target.value),
                      }))
                    }
                    data-testid="input-ordine"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="attiva">Stato</Label>
                  <div className="flex items-center gap-2 pt-2">
                    <Switch
                      id="attiva"
                      checked={formData.attiva}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({ ...prev, attiva: checked }))
                      }
                      data-testid="switch-attiva"
                    />
                    <span className="text-sm text-gray-600">
                      {formData.attiva ? "Attivo" : "Inattivo"}
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="availability" className="flex-1 overflow-y-auto px-6 space-y-6 py-6 min-h-0">
              <div className="space-y-4">
                <div>
                  <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <Clock className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                      <strong>Gestione Orari e Giorni:</strong> Configura gli orari di lavoro per ogni giorno della settimana. 
                      Per disabilitare un giorno, deseleziona il toggle "Attivo".
                    </div>
                  </div>

                  <Collapsible defaultOpen>
                    <CollapsibleTrigger className="flex items-center gap-2 text-base font-medium hover:underline">
                      <Clock className="w-4 h-4" />
                      Orari Personalizzati
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 space-y-4">
                      <p className="text-sm text-gray-500">
                        Configura gli orari di lavoro per ogni giorno della settimana. Usa il toggle "Attivo" per abilitare/disabilitare giorni specifici.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 touch-manipulation"
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              customWorkingHours: JSON.parse(JSON.stringify(DEFAULT_CONSULTATION_HOURS)) as ConsultationWorkingHours[],
                            }));
                          }}
                          disabled={!!formData.customWorkingHours}
                        >
                          {formData.customWorkingHours ? "Orari personalizzati attivi" : "Attiva orari personalizzati"}
                        </Button>
                        
                        {formData.customWorkingHours && (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11 touch-manipulation"
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                customWorkingHours: undefined,
                              }));
                            }}
                          >
                            Ripristina orari predefiniti
                          </Button>
                        )}
                      </div>

                      {formData.customWorkingHours && (
                        <div className="border-t pt-4">
                          <div className="space-y-4 md:space-y-5">
                          {['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'].map((dayName, dayIdx) => {
                            const dayConfig = formData.customWorkingHours?.find(h => h.giornoSettimana === dayIdx);

                            return (
                              <Card 
                                key={dayIdx} 
                                className="p-4 md:p-5 border border-gray-200 shadow-sm"
                              >
                                {/* Header */}
                                <div className="flex items-center justify-between mb-3">
                                  <Label className="text-sm font-semibold">{dayName}</Label>

                                  <div className="flex items-center gap-2">
                                    <Switch
                                      checked={dayConfig?.attivo ?? false}
                                      onCheckedChange={(checked) => {
                                        setFormData(prev => ({
                                          ...prev,
                                          customWorkingHours: prev.customWorkingHours?.map((h) =>
                                            h.giornoSettimana === dayIdx
                                              ? { ...h, attivo: checked }
                                              : h
                                          ),
                                        }));
                                      }}
                                    />
                                    <span className="text-xs text-gray-500">
                                      {dayConfig?.attivo ? "Attivo" : "Chiuso"}
                                    </span>
                                  </div>
                                </div>

                                {/* Body */}
                                {dayConfig?.attivo && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

                                    {/* Apertura */}
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Apertura</Label>
                                      <Input
                                        type="time"
                                        value={dayConfig.apertura}
                                        onChange={(e) =>
                                          setFormData(prev => ({
                                            ...prev,
                                            customWorkingHours: prev.customWorkingHours?.map((h) =>
                                              h.giornoSettimana === dayIdx
                                                ? { ...h, apertura: e.target.value }
                                                : h
                                            ),
                                          }))
                                        }
                                        className="h-10 text-sm"
                                      />
                                    </div>

                                    {/* Pausa Inizio */}
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Pausa Inizio</Label>
                                      <Input
                                        type="time"
                                        value={dayConfig.pausaInizio || ""}
                                        onChange={(e) =>
                                          setFormData(prev => ({
                                            ...prev,
                                            customWorkingHours: prev.customWorkingHours?.map((h) =>
                                              h.giornoSettimana === dayIdx
                                                ? { ...h, pausaInizio: e.target.value || undefined }
                                                : h
                                            ),
                                          }))
                                        }
                                        className="h-10 text-sm"
                                      />
                                    </div>

                                    {/* Pausa Fine */}
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Pausa Fine</Label>
                                      <Input
                                        type="time"
                                        value={dayConfig.pausaFine || ""}
                                        onChange={(e) =>
                                          setFormData(prev => ({
                                            ...prev,
                                            customWorkingHours: prev.customWorkingHours?.map((h) =>
                                              h.giornoSettimana === dayIdx
                                                ? { ...h, pausaFine: e.target.value || undefined }
                                                : h
                                            ),
                                          }))
                                        }
                                        className="h-10 text-sm"
                                      />
                                    </div>

                                    {/* Chiusura */}
                                    <div className="space-y-1">
                                      <Label className="text-xs font-medium">Chiusura</Label>
                                      <Input
                                        type="time"
                                        value={dayConfig.chiusura}
                                        onChange={(e) =>
                                          setFormData(prev => ({
                                            ...prev,
                                            customWorkingHours: prev.customWorkingHours?.map((h) =>
                                              h.giornoSettimana === dayIdx
                                                ? { ...h, chiusura: e.target.value }
                                                : h
                                            ),
                                          }))
                                        }
                                        className="h-10 text-sm"
                                      />
                                    </div>
                                  </div>
                                )}
                              </Card>
                            );
                          })}
                          </div>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="images" className="flex-1 overflow-y-auto px-6 space-y-6 py-6 min-h-0">
              {editingTemplate ? (
                <div className="space-y-4">
                  <div>
                    <Label className="text-base font-medium">Immagini Template</Label>
                    <p className="text-sm text-gray-500 mt-1">
                      Carica fino a 10 immagini (max 5MB ciascuna) per mostrare ai clienti
                    </p>
                  </div>

                  <div className="flex items-center gap-4">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      disabled={uploadingImage || (formData.imageUrls?.length ?? 0) >= 10}
                      className="max-w-xs"
                      data-testid="input-upload-image"
                    />
                    {uploadingImage && (
                      <span className="text-sm text-gray-500">Caricamento...</span>
                    )}
                  </div>

                  {formData.imageUrls && formData.imageUrls.length > 0 ? (
                    <div className="grid grid-cols-3 gap-4">
                      {formData.imageUrls.map((url, idx) => (
                        <div key={idx} className="relative group border rounded-lg overflow-hidden">
                          <img
                            src={url}
                            alt={`Template image ${idx + 1}`}
                            className="w-full h-32 object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="icon"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleImageDelete(url)}
                            data-testid={`button-delete-image-${idx}`}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                      <ImageIcon className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500">Nessuna immagine caricata</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ImageIcon className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500">
                    Salva il template prima di caricare immagini
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="fields" className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Header fisso con pulsante */}
              <div className="px-6 pt-6 pb-4 border-b bg-white shrink-0 z-10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <Label className="text-base font-medium text-blue-gray">
                      Campi Job Data
                    </Label>
                    <p className="text-xs text-gray-500 mt-1">
                      Configura i campi da raccogliere durante la consulenza
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addJobDataField}
                    data-testid="button-add-field"
                    className="border-sage text-sage hover:bg-sage/10 w-full sm:w-auto"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Aggiungi Campo
                  </Button>
                </div>
              </div>

              {/* Area scrollabile */}
              <div className="flex-1 overflow-y-auto px-6 py-6" ref={fieldsContainerRef} style={{ maxHeight: 'calc(90vh - 350px)' }}>
                <div className="space-y-6 max-w-5xl mx-auto">
                  {/* Tutorial FieldKey Completo - Collapsabile */}
                  <Collapsible defaultOpen={false}>
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-4 shadow-sm">
                      <CollapsibleTrigger className="w-full flex items-center justify-between hover:bg-blue-100/50 rounded-lg px-2 py-2 transition-colors">
                        <h4 className="text-base font-bold text-blue-900 flex items-center gap-2">
                          <FileText className="w-5 h-5" />
                          📘 Tutorial: Come Funzionano i FieldKey
                        </h4>
                        <ChevronDown className="w-5 h-5 text-blue-600 shrink-0" />
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent className="pt-4">
                    
                    <div className="space-y-4">
                      {/* Cosa sono i fieldKey */}
                      <div className="bg-white rounded-lg p-4 border border-blue-200">
                        <h5 className="text-sm font-semibold text-blue-900 mb-2">🔑 Cosa sono i FieldKey?</h5>
                        <p className="text-xs text-blue-800 leading-relaxed">
                          I <strong>fieldKey</strong> sono identificatori univoci che collegano i campi della consulenza ai campi del job. 
                          Quando converti una consulenza in job, il sistema usa questi identificatori per copiare automaticamente i dati nei campi corretti.
                        </p>
                      </div>

                      {/* Campi Standard Mappabili */}
                      <div className="bg-white rounded-lg p-4 border border-green-200">
                        <h5 className="text-sm font-semibold text-green-900 mb-2">✅ FieldKey Standard (Mapping Automatico)</h5>
                        <p className="text-xs text-green-800 mb-3">
                          Usa questi <strong>fieldKey</strong> per mappare automaticamente i dati ai campi del job:
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="flex items-start gap-2">
                            <code className="bg-green-100 px-2 py-1 rounded border border-green-300 text-green-900 font-mono text-xs whitespace-nowrap">eventDate</code>
                            <span className="text-gray-600">→ Data evento</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <code className="bg-green-100 px-2 py-1 rounded border border-green-300 text-green-900 font-mono text-xs whitespace-nowrap">eventLocation</code>
                            <span className="text-gray-600">→ Location ricevimento</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <code className="bg-green-100 px-2 py-1 rounded border border-green-300 text-green-900 font-mono text-xs whitespace-nowrap">rituLocation</code>
                            <span className="text-gray-600">→ Location rito</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <code className="bg-green-100 px-2 py-1 rounded border border-green-300 text-green-900 font-mono text-xs whitespace-nowrap">rituTime</code>
                            <span className="text-gray-600">→ Orario rito</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <code className="bg-green-100 px-2 py-1 rounded border border-green-300 text-green-900 font-mono text-xs whitespace-nowrap">startTime</code>
                            <span className="text-gray-600">→ Orario inizio</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <code className="bg-green-100 px-2 py-1 rounded border border-green-300 text-green-900 font-mono text-xs whitespace-nowrap">endTime</code>
                            <span className="text-gray-600">→ Orario fine</span>
                          </div>
                        </div>
                      </div>

                      {/* Campi Personalizzati */}
                      <div className="bg-white rounded-lg p-4 border border-amber-200">
                        <h5 className="text-sm font-semibold text-amber-900 mb-2">🎨 FieldKey Personalizzati</h5>
                        <p className="text-xs text-amber-800 mb-3">
                          Puoi creare campi personalizzati con qualsiasi <strong>fieldKey</strong> (es. "numeroInvitati", "temaColore", ecc.). 
                          Questi dati verranno salvati nelle <strong>Note Interne</strong> del job in formato leggibile.
                        </p>
                        <div className="bg-amber-50 rounded border border-amber-300 p-3">
                          <p className="text-xs text-amber-900 font-medium mb-2">Esempio:</p>
                          <div className="space-y-1 text-xs text-amber-800 font-mono">
                            <div className="flex gap-2">
                              <span className="text-amber-600">fieldKey:</span>
                              <code className="bg-white px-1 rounded">numeroInvitati</code>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-amber-600">Label:</span>
                              <span>Numero Invitati Previsti</span>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-amber-600">Tipo:</span>
                              <span>number</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Best Practices */}
                      <div className="bg-white rounded-lg p-4 border border-purple-200">
                        <h5 className="text-sm font-semibold text-purple-900 mb-2">💡 Best Practices</h5>
                        <ul className="space-y-2 text-xs text-purple-800">
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 font-bold">•</span>
                            <span>Usa <strong>camelCase</strong> per i fieldKey personalizzati (es. "temaColore", "numeroInvitati")</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 font-bold">•</span>
                            <span>Scegli nomi descrittivi e in <strong>inglese</strong> per compatibilità futura</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 font-bold">•</span>
                            <span>Per dati importanti, usa i <strong>fieldKey standard</strong> quando possibile</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="text-purple-500 font-bold">•</span>
                            <span>Il <strong>Label</strong> è quello che vede il cliente, puoi scriverlo in italiano</span>
                          </li>
                        </ul>
                      </div>

                      {/* Esempio Pratico */}
                      <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-4 border-2 border-dashed border-green-400">
                        <h5 className="text-sm font-semibold text-green-900 mb-2">🎯 Esempio Pratico: Template Matrimonio</h5>
                        <div className="space-y-2 text-xs">
                          <div className="bg-white rounded p-2 border border-green-200">
                            <div className="font-semibold text-green-900 mb-1">Campo 1 (Standard):</div>
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><strong>fieldKey:</strong> <code className="bg-green-100 px-1 rounded">eventDate</code></div>
                              <div><strong>Label:</strong> "Data del Matrimonio"</div>
                              <div><strong>Tipo:</strong> date</div>
                              <div><strong>Risultato:</strong> ✅ Compila automaticamente "eventDate" del job</div>
                            </div>
                          </div>
                          
                          <div className="bg-white rounded p-2 border border-blue-200">
                            <div className="font-semibold text-blue-900 mb-1">Campo 2 (Standard):</div>
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><strong>fieldKey:</strong> <code className="bg-blue-100 px-1 rounded">eventLocation</code></div>
                              <div><strong>Label:</strong> "Location Ricevimento"</div>
                              <div><strong>Tipo:</strong> text</div>
                              <div><strong>Risultato:</strong> ✅ Compila automaticamente "eventLocation" del job</div>
                            </div>
                          </div>

                          <div className="bg-white rounded p-2 border border-amber-200">
                            <div className="font-semibold text-amber-900 mb-1">Campo 3 (Personalizzato):</div>
                            <div className="grid grid-cols-2 gap-2 text-gray-700">
                              <div><strong>fieldKey:</strong> <code className="bg-amber-100 px-1 rounded">temaColore</code></div>
                              <div><strong>Label:</strong> "Tema e Colori Scelti"</div>
                              <div><strong>Tipo:</strong> text</div>
                              <div><strong>Risultato:</strong> 📝 Salvato in "Note Interne" del job</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>

                  {/* Lista campi o empty state */}
                  {formData.jobDataFields && formData.jobDataFields.length > 0 ? (
                    <div className="space-y-4">
                      {formData.jobDataFields.map((field, idx) => {
                        // Colori alternati per feedback visivo (palette Image Studio)
                        const colors = [
                          { bg: 'from-green-50/80 to-emerald-50/60', border: 'border-l-green-500' },    // Sage/Green
                          { bg: 'from-orange-50/80 to-amber-50/60', border: 'border-l-orange-500' },   // Terra/Orange
                          { bg: 'from-yellow-50/80 to-amber-50/60', border: 'border-l-amber-500' },    // Gold/Amber
                          { bg: 'from-blue-50/80 to-sky-50/60', border: 'border-l-blue-400' },         // Accent Blue
                        ];
                        const colorScheme = colors[idx % colors.length];
                        
                        return (
                        <Card key={idx} className={`border-l-4 ${colorScheme.border} bg-gradient-to-r ${colorScheme.bg} shadow-sm hover:shadow-md transition-shadow`}>
                          <CardContent className="p-4 sm:p-6">
                            <div className="space-y-4">
                              {/* Header campo con badge e azioni */}
                              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    Campo #{idx + 1}
                                  </Badge>
                                  {field.required && (
                                    <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                                      Obbligatorio
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeJobDataField(idx)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  data-testid={`button-remove-field-${idx}`}
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  <span className="hidden sm:inline">Rimuovi</span>
                                </Button>
                              </div>

                              {/* Griglia campi input */}
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label className="text-sm font-medium flex items-center gap-1">
                                    Label Cliente
                                    <span className="text-red-500">*</span>
                                    <span className="text-xs text-gray-500 font-normal ml-1">(quello che vede il cliente)</span>
                                  </Label>
                                  <Input
                                    value={field.label}
                                    onChange={(e) =>
                                      updateJobDataField(idx, { label: e.target.value })
                                    }
                                    placeholder="es. Data del Matrimonio"
                                    data-testid={`input-field-label-${idx}`}
                                    className="w-full"
                                  />
                                  <p className="text-xs text-gray-500 italic">Scrivi in italiano, sarà mostrato al cliente nel form</p>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-sm font-medium flex items-center gap-1">
                                    FieldKey Tecnico
                                    <span className="text-red-500">*</span>
                                    <span className="text-xs text-gray-500 font-normal ml-1">(nome tecnico)</span>
                                  </Label>
                                  <Input
                                    value={field.fieldKey}
                                    onChange={(e) => {
                                      const value = e.target.value.trim();
                                      // Previeni fieldKey vuoto - mantieni almeno "campo_N" se l'utente cancella tutto
                                      if (value.length === 0) {
                                        return; // Blocca cancellazione completa
                                      }
                                      updateJobDataField(idx, { fieldKey: value });
                                    }}
                                    placeholder="es. eventDate"
                                    data-testid={`input-field-key-${idx}`}
                                    className="w-full font-mono text-sm"
                                    required
                                  />
                                  <p className="text-xs text-gray-500 italic">
                                    Usa fieldKey standard per mapping automatico: 
                                    <code className="bg-green-100 px-1 rounded text-green-800 mx-1">eventDate</code>
                                    <code className="bg-green-100 px-1 rounded text-green-800 mx-1">eventLocation</code>
                                  </p>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-sm font-medium flex items-center gap-1">
                                    Tipo Campo
                                    <span className="text-red-500">*</span>
                                  </Label>
                                  <Select
                                    value={field.type}
                                    onValueChange={(value) =>
                                      updateJobDataField(idx, { type: value as any })
                                    }
                                  >
                                    <SelectTrigger
                                      data-testid={`select-field-type-${idx}`}
                                      className="w-full"
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Testo</SelectItem>
                                      <SelectItem value="date">Data</SelectItem>
                                      <SelectItem value="number">Numero</SelectItem>
                                      <SelectItem value="select">Select</SelectItem>
                                      <SelectItem value="textarea">Textarea</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Placeholder</Label>
                                  <Input
                                    value={field.placeholder || ""}
                                    onChange={(e) =>
                                      updateJobDataField(idx, {
                                        placeholder: e.target.value,
                                      })
                                    }
                                    placeholder="es. gg/mm/aaaa"
                                    data-testid={`input-field-placeholder-${idx}`}
                                    className="w-full"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <Label className="text-sm font-medium">Testo di Aiuto</Label>
                                  <Input
                                    value={field.helperText || ""}
                                    onChange={(e) =>
                                      updateJobDataField(idx, {
                                        helperText: e.target.value,
                                      })
                                    }
                                    placeholder="Testo di aiuto per il cliente"
                                    className="w-full"
                                  />
                                </div>
                              </div>

                              {/* Toggle obbligatorio */}
                              <div className="flex items-center gap-2 pt-2 border-t">
                                <Switch
                                  checked={field.required}
                                  onCheckedChange={(checked) =>
                                    updateJobDataField(idx, { required: checked })
                                  }
                                  data-testid={`switch-field-required-${idx}`}
                                />
                                <Label className="text-sm cursor-pointer">
                                  Campo Obbligatorio
                                </Label>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
                      <FileText className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Nessun campo job data configurato
                      </p>
                      <p className="text-xs text-gray-500 mb-4">
                        Clicca su "Aggiungi Campo" per iniziare a configurare i campi
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addJobDataField}
                        className="border-sage text-sage hover:bg-sage/10"
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        Crea Primo Campo
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo template? Questa azione è
              irreversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Migration Dialog */}
      <AlertDialog
        open={migrationDialogOpen}
        onOpenChange={setMigrationDialogOpen}
      >
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-terracotta" />
              Migrazione Template Consulenze
            </AlertDialogTitle>
            <AlertDialogDescription>
              Questa operazione inizializza <code>customWorkingHours</code> per template legacy
              e sincronizza <code>excludedDays</code> per tutti i template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          {migrationReport && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Template da inizializzare:</span>
                  <Badge variant={migrationReport.initialized > 0 ? "default" : "outline"}>
                    {migrationReport.initialized}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Template da sincronizzare:</span>
                  <Badge variant={migrationReport.syncedOnly > 0 ? "default" : "outline"}>
                    {migrationReport.syncedOnly}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Template già OK:</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    {migrationReport.skipped}
                  </Badge>
                </div>
              </div>

              {(migrationReport.initialized > 0 || migrationReport.syncedOnly > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertDialogDescription className="text-sm text-amber-800 m-0">
                      <strong>Nota importante:</strong> Da ora in poi, l'esclusione giorni si gestisce 
                      solo via <code className="bg-amber-100 px-1 rounded">customWorkingHours</code> 
                      (impostando <code className="bg-amber-100 px-1 rounded">attivo: false</code>). 
                      L'array <code className="bg-amber-100 px-1 rounded">excludedDays</code> non verrà più utilizzato.
                    </AlertDialogDescription>
                  </div>
                </div>
              )}

              {migrationReport.initialized === 0 && migrationReport.syncedOnly === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-800 text-center">
                    ✅ Tutti i template sono già configurati correttamente. Nessuna migrazione necessaria.
                  </p>
                </div>
              )}
            </div>
          )}
          
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={isMigrating}
              data-testid="button-cancel-migration"
            >
              Annulla
            </AlertDialogCancel>
            {migrationReport && (migrationReport.initialized > 0 || migrationReport.syncedOnly > 0) && (
              <AlertDialogAction
                onClick={handleExecuteMigration}
                disabled={isMigrating}
                className="bg-terracotta hover:bg-terracotta/90"
                data-testid="button-confirm-migration"
              >
                {isMigrating ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Migrazione in corso...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Esegui Migrazione
                  </>
                )}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

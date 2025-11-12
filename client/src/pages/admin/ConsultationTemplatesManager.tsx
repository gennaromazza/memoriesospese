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
} from "lucide-react";
import { getJobTypes } from "@/lib/job-types";
import type { JobType as JobTypeDoc } from "@shared/job-types";
import { storage } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";


export default function ConsultationTemplatesManager() {
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<ConsultationTemplate | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState<Partial<InsertConsultationTemplate>>(
    {
      nome: "",
      jobType: "",
      durataMinuti: 60,
      descrizione: "",
      jobDataFields: [],
      excludedDays: [],
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
      excludedDays: [],
      customWorkingHours: undefined,
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
      excludedDays: template.excludedDays || [],
      customWorkingHours: template.customWorkingHours,
      imageUrls: template.imageUrls || [],
      attiva: template.attiva,
      ordine: template.ordine || 0,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    // Validazione base
    if (!formData.nome.trim()) {
      toast({
        variant: "destructive",
        title: "Nome obbligatorio",
        description: "Inserisci un nome per il template",
      });
      return;
    }

    if (!formData.jobType) {
      toast({
        variant: "destructive",
        title: "Job Type obbligatorio",
        description: "Seleziona un tipo di lavoro",
      });
      return;
    }

    if (!formData.durataMinuti || formData.durataMinuti <= 0) {
      toast({
        variant: "destructive",
        title: "Durata non valida",
        description: "Inserisci una durata valida in minuti",
      });
      return;
    }

    // Valida che imageUrls sia un array di stringhe
    const validImageUrls = Array.isArray(formData.imageUrls)
      ? formData.imageUrls.filter(url => typeof url === 'string' && url.trim() !== '')
      : [];

    try {
      // Prepara i dati con imageUrls validato
      const dataToSave = {
        ...formData,
        imageUrls: validImageUrls
      };

      if (editingTemplate) {
        await updateMutation.mutateAsync({
          id: editingTemplate.id,
          data: dataToSave,
        });
        toast({
          title: "Template aggiornato",
          description: `Template "${formData.nome}" aggiornato con successo`,
        });
      } else {
        await createMutation.mutateAsync(dataToSave);
        toast({
          title: "Template creato",
          description: `Template "${formData.nome}" creato con successo`,
        });
      }

      setDialogOpen(false);
      setEditingTemplate(null);
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

  // Availability handlers
  const toggleExcludedDay = (dayIndex: number) => {
    setFormData((prev) => {
      const current = prev.excludedDays || [];
      if (current.includes(dayIndex)) {
        return {
          ...prev,
          excludedDays: current.filter((d) => d !== dayIndex),
        };
      } else {
        return {
          ...prev,
          excludedDays: [...current, dayIndex],
        };
      }
    });
  };

  // Image upload handlers
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validazione dimensione (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: "destructive",
        title: "File troppo grande",
        description: "L'immagine deve essere inferiore a 5MB",
      });
      return;
    }

    setUploadingImage(true);

    try {
      const imageCompression = (await import("browser-image-compression")).default;

      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);

      const storageRef = ref(
        storage,
        `consultation-templates/${Date.now()}_${file.name}`,
      );

      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      // Assicurati che imageUrls sia sempre un array di stringhe
      const currentImages = Array.isArray(formData.imageUrls) ? formData.imageUrls : [];

      setFormData((prev) => ({
        ...prev,
        imageUrls: [...currentImages, downloadURL],
      }));

      toast({
        title: "Immagine caricata",
        description: "Immagine aggiunta con successo",
      });

      // Reset input
      event.target.value = "";
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

  const handleRemoveImage = async (imageUrl: string) => {
    if (!editingTemplate) return;

    try {
      // Rimuovi da storage
      const imageRef = ref(storage, imageUrl);
      await deleteObject(imageRef);

      // Aggiorna formData - assicurati che sia sempre un array di stringhe
      setFormData((prev) => {
        const currentImages = Array.isArray(prev.imageUrls) ? prev.imageUrls : [];
        return {
          ...prev,
          imageUrls: currentImages.filter((url) => typeof url === 'string' && url !== imageUrl),
        };
      });

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

  const sortedTemplates = [...templates].sort(
    (a: ConsultationTemplate, b: ConsultationTemplate) => {
      if (a.jobType !== b.jobType) {
        return a.jobType.localeCompare(b.jobType);
      }
      return (a.ordine || 0) - (b.ordine || 0);
    },
  );

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
        <Button
          onClick={handleOpenCreate}
          className="bg-[hsl(var(--terra))] hover:bg-[hsl(var(--terra))]/90"
          data-testid="button-create-template"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Template
        </Button>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo Lavoro</TableHead>
                  <TableHead>Durata</TableHead>
                  <TableHead>Campi Job</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTemplates.map((template) => (
                  <React.Fragment key={template.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-gray-50"
                      data-testid={`row-template-${template.id}`}
                    >
                      <TableCell
                        onClick={() => toggleRowExpanded(template.id)}
                        data-testid={`button-expand-${template.id}`}
                      >
                        {expandedRows.has(template.id) ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {template.nome}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {jobTypes.find(
                            (jt: JobTypeDoc) => jt.slug === template.jobType,
                          )?.nome || template.jobType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Clock className="w-3 h-3" />
                          {template.durataMinuti} min
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {template.jobDataFields?.length || 0} campi
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {template.attiva ? (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            Attivo
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-gray-100 text-gray-600"
                          >
                            Inattivo
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
                      <TableRow className="bg-gray-50">
                        <TableCell colSpan={7} className="py-4">
                          <div className="pl-8 space-y-2">
                            <p className="text-sm text-gray-700">
                              <strong>Descrizione:</strong>{" "}
                              {template.descrizione}
                            </p>
                            {template.jobDataFields &&
                              template.jobDataFields.length > 0 && (
                                <div>
                                  <p className="text-sm font-medium text-gray-700 mb-2">
                                    Campi Job Data:
                                  </p>
                                  <div className="space-y-1">
                                    {template.jobDataFields.map(
                                      (
                                        field: ConsultationJobField,
                                        idx: number,
                                      ) => (
                                        <div
                                          key={idx}
                                          className="text-sm text-gray-600 flex items-center gap-2"
                                        >
                                          <Badge
                                            variant="outline"
                                            className="text-xs"
                                          >
                                            {field.type}
                                          </Badge>
                                          <span className="font-medium">
                                            {field.label}
                                          </span>
                                          {field.required && (
                                            <span className="text-red-500 text-xs">
                                              *
                                            </span>
                                          )}
                                          {field.placeholder && (
                                            <span className="text-gray-400 text-xs">
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
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] w-full flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-2 border-b">
            <DialogTitle className="text-2xl font-playfair">
              {editingTemplate ? "Modifica Template" : "Nuovo Template"}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Configura il template di consulenza con campi job dinamici
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-4 border-b flex justify-end gap-3">
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

          <Tabs defaultValue="general" className="flex-1 flex flex-col">
            <TabsList className="mx-6 mt-4">
              <TabsTrigger value="general">Generale</TabsTrigger>
              <TabsTrigger value="availability">Disponibilità</TabsTrigger>
              <TabsTrigger value="images">Immagini</TabsTrigger>
              <TabsTrigger value="fields">Campi Job</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="flex-1 overflow-y-auto px-6 space-y-6 py-6">
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

            <TabsContent value="availability" className="flex-1 overflow-y-auto px-6 space-y-6 py-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Giorni Esclusi</Label>
                  <p className="text-sm text-gray-500 mt-1 mb-3">
                    Seleziona i giorni in cui NON accettare prenotazioni
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'].map((day, idx) => (
                      <div key={idx} className="flex items-center space-x-2 border rounded-md px-3 py-2 hover:bg-gray-50">
                        <Checkbox
                          id={`day-${idx}`}
                          checked={formData.excludedDays?.includes(idx)}
                          onCheckedChange={() => toggleExcludedDay(idx)}
                          data-testid={`checkbox-day-${idx}`}
                        />
                        <Label
                          htmlFor={`day-${idx}`}
                          className="text-sm font-medium leading-none cursor-pointer"
                        >
                          {day}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-4">
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-base font-medium hover:underline">
                      <Clock className="w-4 h-4" />
                      Orari Personalizzati (opzionale)
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-4 space-y-4">
                      <p className="text-sm text-gray-500">
                        Configura orari specifici per questo template. Se non configurato, verranno usati gli orari predefiniti (Lun-Ven 9-18, pausa 13-14:30).
                      </p>

                      <div className="space-y-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
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
                            size="sm"
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
                        <div className="space-y-3 border-t pt-4">
                          {['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'].map((dayName, dayIdx) => {
                            const dayConfig = formData.customWorkingHours?.find(h => h.giornoSettimana === dayIdx);

                            return (
                              <Card key={dayIdx} className="p-4">
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-sm font-medium">{dayName}</Label>
                                    <div className="flex items-center gap-2">
                                      <Switch
                                        checked={dayConfig?.attivo ?? false}
                                        onCheckedChange={(checked) => {
                                          setFormData((prev) => ({
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

                                  {dayConfig?.attivo && (
                                    <div className="grid grid-cols-4 gap-3">
                                      <div className="space-y-1">
                                        <Label className="text-xs">Apertura</Label>
                                        <Input
                                          type="time"
                                          value={dayConfig.apertura}
                                          onChange={(e) => {
                                            setFormData((prev) => ({
                                              ...prev,
                                              customWorkingHours: prev.customWorkingHours?.map((h) =>
                                                h.giornoSettimana === dayIdx
                                                  ? { ...h, apertura: e.target.value }
                                                  : h
                                              ),
                                            }));
                                          }}
                                          className="text-xs"
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <Label className="text-xs">Pausa Inizio</Label>
                                        <Input
                                          type="time"
                                          value={dayConfig.pausaInizio || ""}
                                          onChange={(e) => {
                                            setFormData((prev) => ({
                                              ...prev,
                                              customWorkingHours: prev.customWorkingHours?.map((h) =>
                                                h.giornoSettimana === dayIdx
                                                  ? { ...h, pausaInizio: e.target.value || undefined }
                                                  : h
                                              ),
                                            }));
                                          }}
                                          className="text-xs"
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <Label className="text-xs">Pausa Fine</Label>
                                        <Input
                                          type="time"
                                          value={dayConfig.pausaFine || ""}
                                          onChange={(e) => {
                                            setFormData((prev) => ({
                                              ...prev,
                                              customWorkingHours: prev.customWorkingHours?.map((h) =>
                                                h.giornoSettimana === dayIdx
                                                  ? { ...h, pausaFine: e.target.value || undefined }
                                                  : h
                                              ),
                                            }));
                                          }}
                                          className="text-xs"
                                        />
                                      </div>

                                      <div className="space-y-1">
                                        <Label className="text-xs">Chiusura</Label>
                                        <Input
                                          type="time"
                                          value={dayConfig.chiusura}
                                          onChange={(e) => {
                                            setFormData((prev) => ({
                                              ...prev,
                                              customWorkingHours: prev.customWorkingHours?.map((h) =>
                                                h.giornoSettimana === dayIdx
                                                  ? { ...h, chiusura: e.target.value }
                                                  : h
                                              ),
                                            }));
                                          }}
                                          className="text-xs"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="images" className="flex-1 overflow-y-auto px-6 space-y-6 py-6">
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
                            onClick={() => handleRemoveImage(url)}
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

            <TabsContent value="fields" className="flex-1 flex flex-col overflow-hidden">
              {/* Header fisso con pulsante */}
              <div className="px-6 pt-6 pb-4 border-b bg-white shrink-0">
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
    </div>
  );
}
/**
 * Consultation Templates Manager - Admin CRUD per template consulenze
 */

import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from "@/lib/consultations";
import type {
  ConsultationTemplate,
  InsertConsultationTemplate,
  UpdateConsultationTemplate,
  ConsultationJobField,
} from "@shared/consultation-types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  // Form state
  const [formData, setFormData] = useState<Partial<InsertConsultationTemplate>>(
    {
      nome: "",
      jobType: "",
      durataMinuti: 60,
      descrizione: "",
      jobDataFields: [],
      attiva: true,
      ordine: 0,
    },
  );

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
    setFormData((prev) => ({
      ...prev,
      jobDataFields: [
        ...(prev.jobDataFields || []),
        {
          fieldKey: `field_${Date.now()}`,
          label: "Nuovo Campo",
          type: "text" as const,
          required: false,
          placeholder: "",
          helperText: "",
        },
      ],
    }));
  };

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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Modifica Template" : "Nuovo Template"}
            </DialogTitle>
            <DialogDescription>
              Configura il template di consulenza con campi job dinamici
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
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

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-base font-medium">Campi Job Data</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addJobDataField}
                  data-testid="button-add-field"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Aggiungi Campo
                </Button>
              </div>

              {formData.jobDataFields && formData.jobDataFields.length > 0 ? (
                <div className="space-y-3">
                  {formData.jobDataFields.map((field, idx) => (
                    <Card key={idx} className="p-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label>Label</Label>
                          <Input
                            value={field.label}
                            onChange={(e) =>
                              updateJobDataField(idx, { label: e.target.value })
                            }
                            placeholder="es. Data Evento"
                            data-testid={`input-field-label-${idx}`}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Tipo</Label>
                          <Select
                            value={field.type}
                            onValueChange={(value) =>
                              updateJobDataField(idx, { type: value as any })
                            }
                          >
                            <SelectTrigger
                              data-testid={`select-field-type-${idx}`}
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
                          <Label>Placeholder</Label>
                          <Input
                            value={field.placeholder || ""}
                            onChange={(e) =>
                              updateJobDataField(idx, {
                                placeholder: e.target.value,
                              })
                            }
                            placeholder="es. gg/mm/aaaa"
                            data-testid={`input-field-placeholder-${idx}`}
                          />
                        </div>

                        <div className="flex items-end gap-4">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={field.required}
                              onCheckedChange={(checked) =>
                                updateJobDataField(idx, { required: checked })
                              }
                              data-testid={`switch-field-required-${idx}`}
                            />
                            <Label className="text-sm">Obbligatorio</Label>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeJobDataField(idx)}
                            className="ml-auto"
                            data-testid={`button-remove-field-${idx}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Nessun campo job data configurato
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-row justify-end gap-2 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel"
            >
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-[hsl(var(--terra))] hover:bg-[hsl(var(--terra))]/90"
              data-testid="button-save"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Salvataggio..."
                : "Salva"}
            </Button>
          </div>
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

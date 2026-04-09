/**
 * Admin — Gestione Template Moduli Informativi
 * Crea, modifica ed elimina i template di moduli riutilizzabili per i job.
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus, Trash2, Edit2, ArrowUp, ArrowDown, ClipboardList, Loader2, Eye, X, GripVertical,
} from 'lucide-react';
import { getAllTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/infoForms';
import type { InfoFormTemplate, InfoFormField } from '@shared/info-form-types';

const FIELD_TYPE_LABELS: Record<InfoFormField['type'], string> = {
  text: 'Testo breve',
  textarea: 'Testo lungo',
  number: 'Numero',
  select: 'Menu a tendina',
  radio: 'Scelta singola',
  checkbox: 'Scelte multiple',
};

function newField(): InfoFormField {
  return {
    id: crypto.randomUUID(),
    label: '',
    type: 'text',
    required: false,
    options: [],
    placeholder: '',
  };
}

function FieldEditor({
  field,
  index,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  field: InfoFormField;
  index: number;
  total: number;
  onChange: (f: InfoFormField) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const needsOptions = ['select', 'radio', 'checkbox'].includes(field.type);
  const [optionInput, setOptionInput] = useState('');

  const addOption = () => {
    const opt = optionInput.trim();
    if (!opt) return;
    onChange({ ...field, options: [...(field.options || []), opt] });
    setOptionInput('');
  };

  const removeOption = (i: number) => {
    const opts = [...(field.options || [])];
    opts.splice(i, 1);
    onChange({ ...field, options: opts });
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-semibold text-gray-600">Campo {index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={onMoveUp} disabled={index === 0} className="h-7 w-7">
            <ArrowUp className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onMoveDown} disabled={index === total - 1} className="h-7 w-7">
            <ArrowDown className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove} className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label className="text-xs">Etichetta *</Label>
          <Input
            value={field.label}
            onChange={e => onChange({ ...field, label: e.target.value })}
            placeholder="Es. Composizione famiglia sposa"
          />
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Tipo campo</Label>
          <Select value={field.type} onValueChange={v => onChange({ ...field, type: v as InfoFormField['type'], options: [] })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FIELD_TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs">Placeholder (opzionale)</Label>
          <Input
            value={field.placeholder || ''}
            onChange={e => onChange({ ...field, placeholder: e.target.value })}
            placeholder="Testo di aiuto..."
          />
        </div>

        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id={`req-${field.id}`}
            checked={field.required}
            onChange={e => onChange({ ...field, required: e.target.checked })}
            className="h-4 w-4 text-[#6b7f6b] border-gray-300 rounded"
          />
          <Label htmlFor={`req-${field.id}`} className="text-xs cursor-pointer">Campo obbligatorio</Label>
        </div>
      </div>

      {needsOptions && (
        <div className="space-y-2">
          <Label className="text-xs">Opzioni</Label>
          <div className="flex gap-2">
            <Input
              value={optionInput}
              onChange={e => setOptionInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
              placeholder="Aggiungi opzione..."
              className="flex-1"
            />
            <Button type="button" size="sm" onClick={addOption} variant="outline">
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(field.options || []).map((opt, i) => (
              <Badge key={i} variant="secondary" className="flex items-center gap-1 pr-1">
                {opt}
                <button onClick={() => removeOption(i)} className="ml-1 hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          {needsOptions && (field.options || []).length === 0 && (
            <p className="text-xs text-amber-600">Aggiungi almeno un'opzione per questo tipo di campo</p>
          )}
        </div>
      )}
    </div>
  );
}

function TemplateFormDialog({
  open,
  template,
  onClose,
}: {
  open: boolean;
  template: InfoFormTemplate | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = !!template;

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [fields, setFields] = useState<InfoFormField[]>(template?.fields || []);
  const [showPreview, setShowPreview] = useState(false);

  const reset = () => {
    setName(template?.name || '');
    setDescription(template?.description || '');
    setFields(template?.fields || []);
    setShowPreview(false);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error('Il nome è obbligatorio');
      for (const f of fields) {
        if (!f.label.trim()) throw new Error('Tutti i campi devono avere un\'etichetta');
        if (['select', 'radio', 'checkbox'].includes(f.type) && (!f.options || f.options.length === 0)) {
          throw new Error(`Il campo "${f.label}" deve avere almeno un'opzione`);
        }
      }
      if (isEdit && template) {
        await updateTemplate(template.id, { name, description, fields });
      } else {
        await createTemplate({ name, description, fields });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infoFormTemplates'] });
      toast({ title: isEdit ? 'Template aggiornato' : 'Template creato' });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: 'Errore', description: err.message, variant: 'destructive' });
    },
  });

  const addField = () => setFields(prev => [...prev, newField()]);

  const updateField = (index: number, updated: InfoFormField) => {
    setFields(prev => prev.map((f, i) => i === index ? updated : f));
  };

  const removeField = (index: number) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    setFields(prev => {
      const arr = [...prev];
      const newIndex = index + dir;
      if (newIndex < 0 || newIndex >= arr.length) return arr;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-playfair text-xl">
            {isEdit ? 'Modifica Template' : 'Nuovo Template Modulo'}
          </DialogTitle>
        </DialogHeader>

        {!showPreview ? (
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label>Nome template *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Scheda Matrimonio" />
            </div>
            <div className="space-y-2">
              <Label>Descrizione (opzionale)</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Breve descrizione dell'uso di questo modulo..."
                rows={2}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Campi ({fields.length})</Label>
                <Button type="button" size="sm" onClick={addField} variant="outline">
                  <Plus className="h-3 w-3 mr-1" />
                  Aggiungi campo
                </Button>
              </div>

              {fields.length === 0 && (
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                  <ClipboardList className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500">Nessun campo. Clicca "Aggiungi campo" per iniziare.</p>
                </div>
              )}

              <div className="space-y-3">
                {fields.map((field, i) => (
                  <FieldEditor
                    key={field.id}
                    field={field}
                    index={i}
                    total={fields.length}
                    onChange={updated => updateField(i, updated)}
                    onRemove={() => removeField(i)}
                    onMoveUp={() => moveField(i, -1)}
                    onMoveDown={() => moveField(i, 1)}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-4">
            <div className="bg-[#f5f0e8] rounded-lg p-4 space-y-4">
              <h3 className="font-playfair text-lg text-gray-800">{name || 'Modulo senza nome'}</h3>
              {fields.map((field, i) => (
                <div key={field.id} className="space-y-1">
                  <p className="text-sm font-medium text-gray-700">
                    <span className="text-[#6b7f6b] font-bold text-xs mr-1">{i + 1}.</span>
                    {field.label || 'Campo senza etichetta'}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <div className="text-xs text-gray-500">[{FIELD_TYPE_LABELS[field.type]}
                    {field.options && field.options.length > 0 && `: ${field.options.join(', ')}`}]
                  </div>
                </div>
              ))}
              {fields.length === 0 && <p className="text-sm text-gray-500 italic">Nessun campo configurato</p>}
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
            <Eye className="h-3 w-3 mr-1" />
            {showPreview ? 'Modifica' : 'Anteprima'}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => { reset(); onClose(); }}>Annulla</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white"
            >
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {isEdit ? 'Salva modifiche' : 'Crea template'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function InfoFormTemplateManager() {
  const { toast } = useToast();
  const [editingTemplate, setEditingTemplate] = useState<InfoFormTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<InfoFormTemplate[]>({
    queryKey: ['infoFormTemplates'],
    queryFn: getAllTemplates,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['infoFormTemplates'] });
      toast({ title: 'Template eliminato' });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: 'Errore eliminazione', variant: 'destructive' });
      setDeleteId(null);
    },
  });

  const openCreate = () => {
    setEditingTemplate(null);
    setDialogOpen(true);
  };

  const openEdit = (t: InfoFormTemplate) => {
    setEditingTemplate(t);
    setDialogOpen(true);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-playfair text-gray-800">Moduli Informativi</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crea template riutilizzabili da inviare ai clienti per raccogliere informazioni logistiche sull'evento.
          </p>
        </div>
        <Button onClick={openCreate} className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Template
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#6b7f6b]" />
        </div>
      )}

      {!isLoading && templates.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-600 mb-1">Nessun template</h3>
          <p className="text-sm text-gray-500 mb-4">
            Crea il tuo primo template per iniziare a inviare moduli informativi ai clienti.
          </p>
          <Button onClick={openCreate} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Crea il primo template
          </Button>
        </div>
      )}

      <div className="grid gap-4">
        {templates.map(template => (
          <Card key={template.id} className="border border-gray-200 hover:border-[#6b7f6b]/40 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">{template.name}</CardTitle>
                  {template.description && (
                    <p className="text-sm text-gray-500 mt-0.5">{template.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {template.fields?.length || 0} {(template.fields?.length || 0) === 1 ? 'campo' : 'campi'}
                  </Badge>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(template)} className="h-8 w-8">
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteId(template.id)}
                    className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {template.fields?.length > 0 && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {template.fields.slice(0, 6).map(f => (
                    <Badge key={f.id} variant="outline" className="text-xs text-gray-600">
                      {f.label}
                      {f.required && <span className="text-red-400 ml-0.5">*</span>}
                    </Badge>
                  ))}
                  {template.fields.length > 6 && (
                    <Badge variant="outline" className="text-xs text-gray-400">
                      +{template.fields.length - 6} altri
                    </Badge>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <TemplateFormDialog
        open={dialogOpen}
        template={editingTemplate}
        onClose={() => { setDialogOpen(false); setEditingTemplate(null); }}
      />

      <AlertDialog open={!!deleteId} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina template</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo template? I moduli già inviati ai clienti rimarranno disponibili.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

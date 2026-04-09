/**
 * Admin — Gestione Template Moduli Informativi
 * Crea, modifica ed elimina i template di moduli riutilizzabili per i job.
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
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
  Download, Upload, Sparkles, Copy, Check,
} from 'lucide-react';
import { getAllTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/infoForms';
import type { InfoFormTemplate, InfoFormField } from '@shared/info-form-types';
import PRESETS_RAW from '@/data/info-form-presets.json';

interface Preset {
  id: string;
  label: string;
  emoji: string;
  name: string;
  description: string;
  fields: Omit<InfoFormField, 'id'>[];
}
const PRESETS: Preset[] = PRESETS_RAW as Preset[];

function normalizeImportedFields(raw: any[]): InfoFormField[] {
  return raw.map(f => ({
    id: crypto.randomUUID(),
    label: typeof f.label === 'string' ? f.label : '',
    type: ['text','textarea','number','select','radio','checkbox'].includes(f.type) ? f.type : 'text',
    required: !!f.required,
    placeholder: typeof f.placeholder === 'string' ? f.placeholder : '',
    options: Array.isArray(f.options) ? f.options.map(String) : [],
  }));
}

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
  const importRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [fields, setFields] = useState<InfoFormField[]>(template?.fields || []);
  const [showPreview, setShowPreview] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setName(template?.name || '');
      setDescription(template?.description || '');
      setFields(template?.fields || []);
      setShowPreview(false);
      setPromptCopied(false);
    }
  }, [open, template]);

  const reset = () => {
    setName(template?.name || '');
    setDescription(template?.description || '');
    setFields(template?.fields || []);
    setShowPreview(false);
  };

  const handleLoadPreset = (preset: Preset) => {
    setName(preset.name);
    setDescription(preset.description);
    setFields(normalizeImportedFields(preset.fields));
    toast({ title: `Preset "${preset.label}" caricato`, description: 'Puoi modificare o aggiungere campi prima di salvare.' });
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        if (json.name) setName(json.name);
        if (json.description) setDescription(json.description);
        if (Array.isArray(json.fields) && json.fields.length > 0) {
          setFields(normalizeImportedFields(json.fields));
          toast({ title: 'JSON importato', description: `${json.fields.length} campi caricati da "${file.name}".` });
        } else {
          toast({ title: 'JSON importato', description: 'Nessun campo trovato — controlla la struttura del file.', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Errore importazione', description: 'File JSON non valido.', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyAIPrompt = async () => {
    const tipoEvento = name.trim() || 'un servizio fotografico professionale';
    const prompt = `Sei un assistente per fotografi professionisti. Crea un modulo informativo per raccogliere informazioni logistiche dai clienti per: ${tipoEvento}.

Rispondi SOLO con un oggetto JSON valido, senza testo aggiuntivo, senza markdown, senza \`\`\`json. Solo il JSON puro.

Struttura obbligatoria:
{
  "name": "Nome del modulo",
  "description": "Breve descrizione dello scopo del modulo",
  "fields": [
    {
      "label": "Testo della domanda",
      "type": "TIPO",
      "required": true,
      "placeholder": "Testo di esempio (opzionale, solo per text/textarea/number)",
      "options": ["Opzione 1", "Opzione 2"]
    }
  ]
}

Tipi di campo disponibili (scegli il più adatto per ogni domanda):
- "text" → risposta breve su una riga. NON includere "options".
- "textarea" → risposta lunga su più righe (note, descrizioni). NON includere "options".
- "number" → valore numerico (numero di invitati, orario numerico). NON includere "options".
- "radio" → scelta SINGOLA tra opzioni fisse. DEVE includere "options" con almeno 2 voci.
- "checkbox" → scelte MULTIPLE tra opzioni fisse. DEVE includere "options" con almeno 2 voci.
- "select" → menu a tendina, scelta singola. DEVE includere "options" con almeno 2 voci.

Regole:
- "options" è obbligatorio per radio/checkbox/select e VIETATO per text/textarea/number.
- Usa "required": true solo per le domande essenziali.
- Crea tra 8 e 12 domande pertinenti e pratiche per il tipo di evento.
- Le domande devono aiutare il fotografo a pianificare il servizio.
- Scrivi tutto in italiano.
- Rispondi SOLO con il JSON, nient'altro.`;

    try {
      await navigator.clipboard.writeText(prompt);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2500);
      toast({ title: '✅ Prompt copiato!', description: 'Incollalo in ChatGPT → poi copia la risposta JSON → Importa JSON.' });
    } catch {
      toast({ title: 'Errore copia', description: 'Copia manualmente il prompt.', variant: 'destructive' });
    }
  };

  const handleExportJSON = () => {
    const data = { name, description, fields: fields.map(({ id: _id, ...rest }) => rest) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modulo-${name.toLowerCase().replace(/\s+/g, '-') || 'template'}.json`;
    a.click();
    URL.revokeObjectURL(url);
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

        {/* Hidden file input for JSON import */}
        <input
          ref={importRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportJSON}
        />

        {!showPreview ? (
          <div className="space-y-5 py-2">

            {/* Preset / Import toolbar */}
            {!isEdit && (
              <div className="bg-[#f5f0e8]/60 border border-[#c4724a]/20 rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#c4724a]" />
                  <span className="text-sm font-medium text-gray-700">Carica domande predefinite</span>
                </div>

                {/* Preset buttons */}
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map(p => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-xs h-8 border-[#6b7f6b]/40 hover:bg-[#6b7f6b]/10"
                      onClick={() => handleLoadPreset(p)}
                    >
                      {p.emoji} {p.label}
                    </Button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#c4724a]/10">
                  <Button
                    type="button"
                    size="sm"
                    variant={promptCopied ? 'default' : 'outline'}
                    className={`text-xs h-8 ${promptCopied ? 'bg-green-600 hover:bg-green-700 text-white' : 'border-[#c4724a]/40 text-[#c4724a] hover:bg-[#c4724a]/10'}`}
                    onClick={handleCopyAIPrompt}
                    title={name.trim() ? `Genera prompt per: "${name}"` : 'Scrivi prima il nome del template, poi copia il prompt'}
                  >
                    {promptCopied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {promptCopied ? 'Prompt copiato!' : 'Copia prompt per ChatGPT'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs h-8 text-[#6b7f6b] hover:text-[#4a5f4a]"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Importa JSON
                  </Button>
                  {!name.trim() && (
                    <span className="text-xs text-amber-600 italic">← scrivi il nome prima di copiare il prompt</span>
                  )}
                </div>
              </div>
            )}

            {/* Edit mode: only show import JSON */}
            {isEdit && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  onClick={() => importRef.current?.click()}
                >
                  <Upload className="h-3 w-3 mr-1" />
                  Importa campi da JSON
                </Button>
                <span className="text-xs text-gray-400">I campi esistenti verranno sostituiti</span>
              </div>
            )}

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
                  <p className="text-sm text-gray-500">Nessun campo. Scegli un preset sopra oppure aggiungi manualmente.</p>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)}>
              <Eye className="h-3 w-3 mr-1" />
              {showPreview ? 'Modifica' : 'Anteprima'}
            </Button>
            {fields.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportJSON} title="Scarica template come file JSON">
                <Download className="h-3 w-3 mr-1" />
                Esporta JSON
              </Button>
            )}
          </div>
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
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const [, navigate] = useLocation();
  const [editingTemplate, setEditingTemplate] = useState<InfoFormTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/admin');
    }
  }, [authLoading, user, navigate]);

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

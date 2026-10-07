/**
 * EDIT TEMPLATE MODAL
 * Form modifica template clausole esistente
 */

import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { updateClauseTemplate } from '@/lib/contract-clauses';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import type { ContractClauseTemplate } from '@shared/contract-clause-types';

const formSchema = z.object({
  titolo: z.string().min(3, 'Titolo troppo corto'),
  attivo: z.boolean(),
  clauses: z.array(z.object({
    id: z.string().optional(),
    text: z.string().min(5, 'Testo clausola troppo corto'),
    required: z.boolean(),
    ordine: z.number()
  })).min(1, 'Aggiungi almeno una clausola')
});

type FormData = z.infer<typeof formSchema>;

interface EditTemplateModalProps {
  template: ContractClauseTemplate;
  open: boolean;
  onClose: () => void;
}

export default function EditTemplateModal({
  template,
  open,
  onClose
}: EditTemplateModalProps) {
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      titolo: template.titolo,
      attivo: template.attivo,
      clauses: template.clauses
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'clauses'
  });

  // Reset form quando cambia template
  useEffect(() => {
    form.reset({
      titolo: template.titolo,
      attivo: template.attivo,
      clauses: template.clauses
    });
  }, [template, form]);

  // Mutation
  const updateMutation = useMutation({
    mutationFn: (data: FormData) => updateClauseTemplate(template.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
      toast({
        title: 'Template aggiornato!',
        description: 'Le modifiche sono state salvate con successo.'
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
    // Ricalcola ordine
    const clausesWithOrder = data.clauses.map((c, idx) => ({
      ...c,
      ordine: idx + 1
    }));
    updateMutation.mutate({ ...data, clauses: clausesWithOrder });
  };

  const addClause = () => {
    append({
      text: '',
      required: false,
      ordine: fields.length + 1
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica Template Clausole</DialogTitle>
          <DialogDescription>
            Modifica il template "{template.titolo}"
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Titolo */}
            <FormField
              control={form.control}
              name="titolo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Titolo Template</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Es. Clausole standard matrimonio 2024"
                      data-testid="input-title"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Opzioni */}
            <div className="space-y-4">
              <FormField
                control={form.control}
                name="attivo"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <FormLabel>Attivo</FormLabel>
                      <FormDescription className="text-xs">
                        Template utilizzabile immediatamente
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-active"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              {template.predefinito && (
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-2">
                  <span className="text-sm">⭐ Questo è il template predefinito per {template.jobType}</span>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                💡 <strong>Nota:</strong> Per modificare il template predefinito, 
                clicca l'icona stella sul template desiderato nella lista.
              </p>
            </div>

            {/* Clausole */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Clausole Contrattuali</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={addClause}
                  data-testid="button-add-clause"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Clausola
                </Button>
              </div>

              <div className="space-y-3">
                {fields.map((field, index) => (
                  <Card key={field.id}>
                    <CardContent className="pt-6 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-2 pt-2">
                          <GripVertical className="w-4 h-4 text-muted-foreground cursor-move" />
                          <span className="text-sm font-medium">{index + 1}</span>
                        </div>

                        <div className="flex-1 space-y-4">
                          <FormField
                            control={form.control}
                            name={`clauses.${index}.text`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Textarea
                                    {...field}
                                    placeholder="Testo della clausola contrattuale..."
                                    rows={3}
                                    data-testid={`input-clause-text-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name={`clauses.${index}.required`}
                            render={({ field }) => (
                              <FormItem className="flex items-center gap-2">
                                <FormControl>
                                  <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    data-testid={`switch-required-${index}`}
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0">
                                  Clausola obbligatoria (richiede accettazione)
                                </FormLabel>
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          data-testid={`button-remove-clause-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                data-testid="button-cancel"
              >
                Annulla
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-submit"
              >
                {updateMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Salva Modifiche
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CREATE TEMPLATE MODAL
 * Form creazione nuovo template clausole
 */

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createClauseTemplate } from '@/lib/contract-clauses';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
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
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Loader2, GripVertical } from 'lucide-react';
import type { JobType as JobsJobType } from '@shared/jobs-types';
import type { JobType as DynamicJobType } from '@shared/job-types';

const formSchema = z.object({
  jobType: z.string().min(1, 'Seleziona un tipo di lavoro'),
  titolo: z.string().min(3, 'Titolo troppo corto'),
  attivo: z.boolean(),
  clauses: z.array(z.object({
    text: z.string().min(5, 'Testo clausola troppo corto'),
    required: z.boolean(),
    ordine: z.number()
  })).min(1, 'Aggiungi almeno una clausola')
});

type FormData = z.infer<typeof formSchema>;

interface CreateTemplateModalProps {
  open: boolean;
  onClose: () => void;
  jobTypes: DynamicJobType[];
  defaultJobType?: string;
}

export default function CreateTemplateModal({
  open,
  onClose,
  jobTypes,
  defaultJobType
}: CreateTemplateModalProps) {
  const { user } = useFirebaseAuth();
  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobType: defaultJobType,
      titolo: '',
      attivo: true,
      clauses: [{
        text: '',
        required: true,
        ordine: 1
      }]
    }
  });

  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: 'clauses'
  });

  // Mutation
  const createMutation = useMutation({
    mutationFn: (data: FormData) => createClauseTemplate(data, user!.uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-clause-templates'] });
      toast({
        title: 'Template creato!',
        description: 'Il template clausole è stato creato con successo.'
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
    // Ricalcola ordine
    const clausesWithOrder = data.clauses.map((c, idx) => ({
      ...c,
      ordine: idx + 1
    }));
    createMutation.mutate({ ...data, clauses: clausesWithOrder });
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
          <DialogTitle>Crea Nuovo Template Clausole</DialogTitle>
          <DialogDescription>
            Crea un template di clausole contrattuali personalizzato
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Tipo Lavoro */}
            <FormField
              control={form.control}
              name="jobType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo Lavoro</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-job-type">
                        <SelectValue placeholder="Seleziona tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {jobTypes.filter(jt => jt.attivo).map(type => (
                        <SelectItem
                          key={type.slug}
                          value={type.slug}
                        >
                          <span className="flex items-center gap-2">
                            <span>{type.icona}</span>
                            <span>{type.nome}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

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
                  <FormDescription>
                    Un nome descrittivo per identificare il template
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Opzioni */}
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
            <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
              💡 <strong>Nota:</strong> Per impostare questo template come predefinito, 
              clicca l'icona stella dopo averlo creato.
            </p>

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

              {fields.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    Nessuna clausola aggiunta
                  </CardContent>
                </Card>
              ) : (
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
                            data-testid={`button-remove-clause-${index}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
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
                disabled={createMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                Crea Template
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

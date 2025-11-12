/**
 * PRESET MANAGER COMPONENT
 * Gestione completa preset: salva, carica, modifica, elimina
 */

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { JobPreset, InsertJobPreset } from '@shared/presets-types';
import { QuoteProduct, QuoteTheme, PaymentScheduleConfig } from '@shared/quotes-types';
import { getPresets, createPreset, deletePreset } from '@/lib/presets';
import { queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Save, FolderOpen, Trash2, Package, DollarSign } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const savePresetSchema = z.object({
  nome: z.string().min(2, 'Nome preset deve contenere almeno 2 caratteri'),
  descrizione: z.string().optional(),
});

interface PresetManagerProps {
  // Modalità: save o load
  mode: 'save' | 'load';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  
  // Per mode='save': dati da salvare
  currentCatalogProductIds?: string[];
  currentProducts?: QuoteProduct[];
  currentDiscountType?: 'amount' | 'percent';
  currentDiscountValue?: number;
  currentTheme?: Partial<QuoteTheme>;
  currentPaymentScheduleConfig?: PaymentScheduleConfig;
  currentClauseTemplateId?: string;
  
  // Per mode='load': callback con preset selezionato
  onPresetSelected?: (preset: JobPreset) => void;
}

export default function PresetManager({
  mode,
  open,
  onOpenChange,
  currentCatalogProductIds = [],
  currentProducts = [],
  currentDiscountType,
  currentDiscountValue,
  currentTheme,
  currentPaymentScheduleConfig,
  currentClauseTemplateId,
  onPresetSelected
}: PresetManagerProps) {
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null);
  const { toast } = useToast();

  // Form per salvare nuovo preset
  const form = useForm<z.infer<typeof savePresetSchema>>({
    resolver: zodResolver(savePresetSchema),
    defaultValues: {
      nome: '',
      descrizione: ''
    }
  });

  // Query lista preset
  const { data: presets = [], isLoading: presetsLoading } = useQuery<JobPreset[]>({
    queryKey: ['presets'],
    queryFn: getPresets,
    enabled: open
  });

  // Mutation crea preset
  const createMutation = useMutation({
    mutationFn: (data: InsertJobPreset) => createPreset(data),
    onSuccess: () => {
      toast({
        title: '✅ Preset salvato',
        description: 'Il preset è stato salvato con successo',
      });
      queryClient.invalidateQueries({ queryKey: ['presets'] });
      form.reset();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '❌ Errore salvataggio preset',
        description: error.message || 'Si è verificato un errore',
      });
    }
  });

  // Mutation elimina preset
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePreset(id),
    onSuccess: () => {
      toast({
        title: '🗑️ Preset eliminato',
        description: 'Il preset è stato eliminato con successo',
      });
      queryClient.invalidateQueries({ queryKey: ['presets'] });
      setDeletePresetId(null);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: '❌ Errore eliminazione preset',
        description: error.message || 'Si è verificato un errore',
      });
    }
  });

  // Handler salva preset
  const handleSavePreset = (values: z.infer<typeof savePresetSchema>) => {
    // Filtra placeholder vuoti da prodotti custom (form requirement vs actual data)
    const validCustomProducts = currentProducts.filter(p => 
      p.nome?.trim() || (p.prezzo !== undefined && p.prezzo > 0)
    );

    // Guard: richiede almeno un prodotto catalogo O un prodotto custom valido
    if (!currentCatalogProductIds.length && !validCustomProducts.length) {
      toast({
        variant: 'destructive',
        title: '❌ Nessun prodotto da salvare',
        description: 'Aggiungi almeno un prodotto dal catalogo o custom prima di salvare il preset',
      });
      return;
    }

    const presetData: InsertJobPreset = {
      nome: values.nome,
      descrizione: values.descrizione,
      catalogProductIds: currentCatalogProductIds,
      products: validCustomProducts, // Salva solo prodotti validi, non placeholder
      discountType: currentDiscountType,
      discountValue: currentDiscountValue,
      theme: currentTheme,
      paymentScheduleConfig: currentPaymentScheduleConfig,
      clauseTemplateId: currentClauseTemplateId,
    };

    createMutation.mutate(presetData);
  };

  // Handler carica preset
  const handleLoadPreset = (preset: JobPreset) => {
    if (onPresetSelected) {
      // Cleanup: filtra placeholder vuoti da preset (migration per preset legacy)
      const cleanedProducts = preset.products.filter(p => 
        p.nome?.trim() || (p.prezzo !== undefined && p.prezzo > 0)
      );
      
      // Passa preset cleaned a QuoteBuilder
      onPresetSelected({
        ...preset,
        products: cleanedProducts
      });
      
      toast({
        title: '📂 Preset caricato',
        description: `Il preset "${preset.nome}" è stato caricato con successo`,
      });
      onOpenChange(false);
    }
  };

  // Handler elimina preset
  const handleDeletePreset = (presetId: string) => {
    deleteMutation.mutate(presetId);
  };

  return (
    <>
      {/* DIALOG PRINCIPALE */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {mode === 'save' ? (
                <>
                  <Save className="h-5 w-5 text-blue-600" />
                  Salva come Preset
                </>
              ) : (
                <>
                  <FolderOpen className="h-5 w-5 text-green-600" />
                  Carica Preset
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {mode === 'save'
                ? 'Salva la configurazione corrente come preset riutilizzabile'
                : 'Seleziona un preset per caricare i prodotti pre-configurati'
              }
            </DialogDescription>
          </DialogHeader>

          {/* MODE: SAVE */}
          {mode === 'save' && (
            <form onSubmit={form.handleSubmit(handleSavePreset)} className="space-y-4">
              <div>
                <Label htmlFor="nome">Nome Preset *</Label>
                <Input
                  id="nome"
                  placeholder="Es. Servizio Base Matrimonio, Premium con Album"
                  {...form.register('nome')}
                  data-testid="input-preset-name"
                />
                {form.formState.errors.nome && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.nome.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="descrizione">Descrizione (opzionale)</Label>
                <Textarea
                  id="descrizione"
                  placeholder="Breve descrizione del preset..."
                  rows={3}
                  {...form.register('descrizione')}
                  data-testid="textarea-preset-description"
                />
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div className="font-medium text-sm">Contenuto Preset:</div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4" />
                  {(() => {
                    const validCustomCount = currentProducts.filter(p => 
                      p.nome?.trim() || (p.prezzo !== undefined && p.prezzo > 0)
                    ).length;
                    const totalCount = currentCatalogProductIds.length + validCustomCount;
                    
                    return (
                      <span>
                        {totalCount} prodotti
                        {currentCatalogProductIds.length > 0 && validCustomCount > 0 && (
                          <span className="text-xs ml-1">
                            ({currentCatalogProductIds.length} catalogo + {validCustomCount} custom)
                          </span>
                        )}
                      </span>
                    );
                  })()}
                </div>
                {currentDiscountValue !== undefined && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <DollarSign className="h-4 w-4" />
                    <span>
                      Sconto: {currentDiscountType === 'percent' 
                        ? `${currentDiscountValue}%` 
                        : `€${currentDiscountValue}`
                      }
                    </span>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-save"
                >
                  Annulla
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                  data-testid="button-confirm-save"
                >
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvataggio...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Salva Preset
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}

          {/* MODE: LOAD */}
          {mode === 'load' && (
            <div className="space-y-4">
              {presetsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Caricamento preset...</span>
                </div>
              ) : presets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>Nessun preset salvato</p>
                  <p className="text-sm mt-2">Salva la tua prima configurazione per iniziare</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {presets.map((preset) => (
                    <Card 
                      key={preset.id} 
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      data-testid={`card-preset-${preset.id}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div 
                            className="flex-1 space-y-2"
                            onClick={() => handleLoadPreset(preset)}
                          >
                            <div className="font-medium">{preset.nome}</div>
                            {preset.descrizione && (
                              <div className="text-sm text-muted-foreground">
                                {preset.descrizione}
                              </div>
                            )}
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline" className="text-xs">
                                <Package className="h-3 w-3 mr-1" />
                                {(preset.catalogProductIds?.length || 0) + preset.products.filter(p => 
                                  p.nome?.trim() || (p.prezzo !== undefined && p.prezzo > 0)
                                ).length} prodotti
                              </Badge>
                              {preset.discountValue !== undefined && (
                                <Badge variant="outline" className="text-xs">
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  Sconto {preset.discountType === 'percent' 
                                    ? `${preset.discountValue}%` 
                                    : `€${preset.discountValue}`
                                  }
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletePresetId(preset.id);
                            }}
                            data-testid={`button-delete-preset-${preset.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  data-testid="button-cancel-load"
                >
                  Chiudi
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* DIALOG CONFERMA ELIMINAZIONE */}
      <AlertDialog open={!!deletePresetId} onOpenChange={(open) => !open && setDeletePresetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Elimina Preset
            </AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo preset? Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              onClick={() => setDeletePresetId(null)}
              data-testid="button-cancel-delete"
            >
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePresetId && handleDeletePreset(deletePresetId)}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Eliminazione...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Elimina
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

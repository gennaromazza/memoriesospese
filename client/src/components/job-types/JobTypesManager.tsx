import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJobTypes,
  createJobType,
  updateJobType
} from '@/lib/job-types';
import { storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, refFromURL } from 'firebase/storage';
import {
  getJobProvenances,
  createJobProvenance,
  updateJobProvenance
} from '@/lib/job-provenances';
import type { JobType } from '@shared/job-types';
import type { JobProvenance } from '@shared/job-provenances';
import { useToast } from '@/hooks/use-toast';
import { useJobEntity } from '@/hooks/useJobEntity';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Plus,
  Loader2,
  Edit,
  Trash2,
  ChevronUp,
  ChevronDown,
  Palette,
  Upload,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({
  nome: z.string().min(2, 'Nome troppo corto'),
  slug: z
    .string()
    .min(2, 'Slug troppo corto')
    .regex(/^[a-z0-9-]+$/, 'Usa solo lettere minuscole, numeri e trattini'),
  attivo: z.boolean(),
  icona: z.string().min(1, 'Icona richiesta'),
  colore: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Formato colore non valido (es. #ec4899)'),
  descrizione: z.string().optional(),
  imageUrl: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

type Entity = JobType | JobProvenance;
type EntityType = 'jobType' | 'provenance';

interface JobEntityFormProps {
  entityType: EntityType;
  entity?: Entity;
  onSuccess: () => void;
  onCancel: () => void;
}

function JobEntityForm({ entityType, entity, onSuccess, onCancel }: JobEntityFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = entityType === 'jobType' ? ['jobTypes'] : ['jobProvenances'];
  const createFn = entityType === 'jobType' ? createJobType : createJobProvenance;
  const updateFn = entityType === 'jobType' ? updateJobType : updateJobProvenance;
  const getAllFn = entityType === 'jobType' ? getJobTypes : getJobProvenances;
  const entityLabel = entityType === 'jobType' ? 'Tipo lavoro' : 'Provenienza';

  const [uploadingImage, setUploadingImage] = useState(false);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: entity
      ? {
          nome: entity.nome,
          slug: entity.slug,
          attivo: entity.attivo,
          icona: entity.icona,
          colore: entity.colore,
          descrizione: (entity as JobType).descrizione || '',
          imageUrl: (entity as JobType).imageUrl || ''
        }
      : {
          nome: '',
          slug: '',
          attivo: true,
          icona: '📸',
          colore: '#6366f1',
          descrizione: '',
          imageUrl: ''
        }
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (entity) {
        await updateFn(entity.id, data);
      } else {
        const allItems = await getAllFn();
        const maxOrdine = Math.max(...allItems.map((t: any) => t.ordine), 0);
        await createFn({
          ...data,
          ordine: maxOrdine + 1
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({
        title: entity ? `${entityLabel} aggiornato` : `${entityLabel} creato`,
        description: 'Operazione completata con successo'
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const handleSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  // Auto-genera slug dal nome
  const handleNomeChange = (nome: string) => {
    if (!entity) {
      const slug = nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      form.setValue('slug', slug);
    }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Tipo file non valido',
        description: 'Carica solo file immagine',
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'File troppo grande',
        description: 'Dimensione massima: 5MB',
      });
      return;
    }

    setUploadingImage(true);

    try {
      const timestamp = Date.now();
      const filename = `${timestamp}_${file.name}`;
      const storageRef = ref(storage, `job-types/${filename}`);
      
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      uploadTask.on('state_changed',
        () => {},
        (error) => {
          console.error('Upload error:', error);
          toast({
            variant: 'destructive',
            title: 'Errore upload',
            description: error.message,
          });
          setUploadingImage(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          form.setValue('imageUrl', downloadURL);
          toast({
            title: 'Immagine caricata',
            description: 'Immagine caricata con successo',
          });
          setUploadingImage(false);
        }
      );
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Errore upload',
        description: error.message,
      });
      setUploadingImage(false);
    }
  };

  const handleDeleteImage = async () => {
    const imageUrl = form.getValues('imageUrl');
    if (!imageUrl) return;

    try {
      const imageRef = refFromURL(imageUrl);
      await deleteObject(imageRef);

      form.setValue('imageUrl', '');
      toast({
        title: 'Immagine eliminata',
        description: 'Immagine rimossa con successo',
      });
    } catch (error: any) {
      console.error('Delete error:', error);
      toast({
        variant: 'destructive',
        title: 'Errore',
        description: 'Impossibile eliminare immagine',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={e => {
                    field.onChange(e);
                    handleNomeChange(e.target.value);
                  }}
                  placeholder="es. Matrimonio"
                  data-testid="input-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Slug</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="es. matrimonio"
                  data-testid="input-slug"
                  disabled={!!entity}
                />
              </FormControl>
              <FormDescription className="text-xs">
                {entity
                  ? 'Lo slug non può essere modificato'
                  : 'Generato automaticamente dal nome'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="icona"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Icona (Emoji)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="es. 💍"
                    maxLength={2}
                    data-testid="input-icona"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="colore"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Colore</FormLabel>
                <FormControl>
                  <div className="flex gap-2">
                    <Input
                      {...field}
                      placeholder="#6366f1"
                      data-testid="input-colore"
                    />
                    <input
                      type="color"
                      value={field.value}
                      onChange={e => field.onChange(e.target.value)}
                      className="w-12 h-10 rounded cursor-pointer"
                      data-testid="picker-colore"
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {entityType === 'jobType' && (
          <>
            <FormField
              control={form.control}
              name="descrizione"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrizione</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Breve descrizione del tipo di servizio (visualizzata nella pagina consulenze)"
                      rows={3}
                      data-testid="textarea-descrizione"
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Descrizione mostrata ai clienti nella pagina di prenotazione consulenze
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="imageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Immagine</FormLabel>
                  <FormControl>
                    <div className="space-y-3">
                      {field.value ? (
                        <div className="relative inline-block">
                          <img
                            src={field.value}
                            alt="Preview"
                            className="h-32 w-32 object-cover rounded-lg border"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                            onClick={handleDeleteImage}
                            data-testid="button-delete-image"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <label
                          htmlFor="image-upload"
                          className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            {uploadingImage ? (
                              <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                            ) : (
                              <>
                                <ImageIcon className="h-8 w-8 text-gray-400 mb-2" />
                                <p className="text-sm text-gray-600">Clicca per caricare immagine</p>
                              </>
                            )}
                          </div>
                          <input
                            id="image-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageUpload}
                            disabled={uploadingImage}
                            data-testid="input-image-upload"
                          />
                        </label>
                      )}
                    </div>
                  </FormControl>
                  <FormDescription className="text-xs">
                    Immagine rappresentativa mostrata nella pagina consulenze (opzionale)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <FormField
          control={form.control}
          name="attivo"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <FormLabel>Attivo</FormLabel>
                <FormDescription className="text-xs">
                  Tipo lavoro utilizzabile
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-attivo"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={mutation.isPending}
            data-testid="button-cancel"
          >
            Annulla
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            data-testid="button-save"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {entity ? 'Salva modifiche' : 'Crea'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function JobTypesManager() {
  const [activeTab, setActiveTab] = useState<EntityType>('jobType');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [deletingEntity, setDeletingEntity] = useState<Entity | null>(null);

  const jobTypeEntity = useJobEntity('jobType');
  const provenanceEntity = useJobEntity('provenance');

  const activeEntity = activeTab === 'jobType' ? jobTypeEntity : provenanceEntity;
  const activeData = activeEntity.items;
  const isLoading = activeEntity.isLoading;
  const toggleMutation = activeEntity.mutations.toggle;
  const deleteMutation = activeEntity.mutations.delete;
  const moveItem = activeEntity.move;
  const entityLabel = activeTab === 'jobType' ? 'Tipo lavoro' : 'Provenienza';
  const entityLabelPlural = activeTab === 'jobType' ? 'tipi di lavoro' : 'provenienze';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-blue-gray">Configurazione Lavori</h3>
          <p className="text-sm text-muted-foreground">
            Gestisci tipi di lavoro e provenienze clienti
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as EntityType)}>
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="jobType" data-testid="tab-job-types">
              Tipi di Lavoro
            </TabsTrigger>
            <TabsTrigger value="provenance" data-testid="tab-provenances">
              Provenienze
            </TabsTrigger>
          </TabsList>

          <Button onClick={() => setCreateModalOpen(true)} data-testid="button-create-entity">
            <Plus className="mr-2 h-4 w-4" />
            Nuovo {activeTab === 'jobType' ? 'tipo' : 'provenienza'}
          </Button>
        </div>

        <TabsContent value={activeTab} className="mt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : activeData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Palette className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Nessun {entityLabel.toLowerCase()} configurato</p>
              <p className="text-sm mt-2">Crea il primo {entityLabel.toLowerCase()} personalizzato</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ordine</TableHead>
                  <TableHead>{entityLabel}</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Colore</TableHead>
                  <TableHead className="w-24">Stato</TableHead>
                  <TableHead className="text-right w-32">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeData.map((entity, index) => (
                  <TableRow key={entity.id} data-testid={`row-entity-${entity.id}`}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveItem(index, 'up')}
                          disabled={index === 0}
                          className="h-6 w-6 p-0"
                          data-testid={`button-move-up-${entity.id}`}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => moveItem(index, 'down')}
                          disabled={index === activeData.length - 1}
                          className="h-6 w-6 p-0"
                          data-testid={`button-move-down-${entity.id}`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{entity.icona}</span>
                        <span className="font-medium">{entity.nome}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{entity.slug}</code>
                    </TableCell>
                    <TableCell>
                      <Badge style={{ backgroundColor: entity.colore }} className="text-white">
                        {entity.colore}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={entity.attivo}
                        onCheckedChange={() => toggleMutation.mutate(entity.id)}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-status-${entity.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingEntity(entity)}
                          data-testid={`button-edit-${entity.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingEntity(entity)}
                          data-testid={`button-delete-${entity.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent data-testid="modal-create-entity">
          <DialogHeader>
            <DialogTitle>Nuovo {entityLabel.toLowerCase()}</DialogTitle>
            <DialogDescription>
              Crea un nuovo {entityLabel.toLowerCase()} personalizzato per il tuo studio
            </DialogDescription>
          </DialogHeader>
          <JobEntityForm
            entityType={activeTab}
            onSuccess={() => setCreateModalOpen(false)}
            onCancel={() => setCreateModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      {editingEntity && (
        <Dialog open={!!editingEntity} onOpenChange={() => setEditingEntity(null)}>
          <DialogContent data-testid="modal-edit-entity">
            <DialogHeader>
              <DialogTitle>Modifica {entityLabel.toLowerCase()}</DialogTitle>
              <DialogDescription>
                Aggiorna le informazioni del {entityLabel.toLowerCase()}
              </DialogDescription>
            </DialogHeader>
            <JobEntityForm
              entityType={activeTab}
              entity={editingEntity}
              onSuccess={() => setEditingEntity(null)}
              onCancel={() => setEditingEntity(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingEntity} onOpenChange={() => setDeletingEntity(null)}>
        <AlertDialogContent data-testid="alert-delete-entity">
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare {activeTab === 'jobType' ? 'il tipo di lavoro' : 'la provenienza'} "
              {deletingEntity?.nome}"? Questa azione non può essere annullata.
              <br />
              <br />
              <strong>Nota:</strong> Non puoi eliminare {activeTab === 'jobType' ? 'un tipo se ci sono lavori o template clausole associati' : 'una provenienza se ci sono clienti o lavori associati'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingEntity && deleteMutation.mutate(deletingEntity.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

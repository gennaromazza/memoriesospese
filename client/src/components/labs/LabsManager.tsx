import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllLabs, createLab, updateLab, deleteLab } from '@/lib/labs';
import type { Lab } from '@shared/lab-types';
import { useToast } from '@/hooks/use-toast';
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
  Printer,
  Mail,
  Phone
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const formSchema = z.object({
  nome: z.string().min(2, 'Nome troppo corto'),
  email: z.string().email('Email non valida'),
  telefono: z.string().optional(),
  note: z.string().optional()
});

type FormData = z.infer<typeof formSchema>;

interface LabFormProps {
  lab?: Lab;
  onSuccess: () => void;
  onCancel: () => void;
}

function LabForm({ lab, onSuccess, onCancel }: LabFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: lab
      ? {
          nome: lab.nome,
          email: lab.email,
          telefono: lab.telefono || '',
          note: lab.note || ''
        }
      : {
          nome: '',
          email: '',
          telefono: '',
          note: ''
        }
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (lab) {
        await updateLab(lab.id, data);
      } else {
        await createLab(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/labs'] });
      toast({
        title: lab ? 'Laboratorio aggiornato' : 'Laboratorio creato',
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

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="es. Laboratorio Stampe Rossi"
                  data-testid="input-lab-nome"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  placeholder="es. info@laboratorio.it"
                  data-testid="input-lab-email"
                />
              </FormControl>
              <FormDescription className="text-xs">
                Email a cui verranno inviati i link per la consegna dei file
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="telefono"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Telefono</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="es. +39 333 1234567"
                  data-testid="input-lab-telefono"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Note</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Note interne sul laboratorio (opzionale)"
                  rows={3}
                  data-testid="textarea-lab-note"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={mutation.isPending}
            data-testid="button-lab-cancel"
          >
            Annulla
          </Button>
          <Button
            type="submit"
            disabled={mutation.isPending}
            data-testid="button-lab-save"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {lab ? 'Salva modifiche' : 'Crea'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function LabsManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingLab, setEditingLab] = useState<Lab | null>(null);
  const [deletingLab, setDeletingLab] = useState<Lab | null>(null);

  const { data: labs = [], isLoading } = useQuery<Lab[]>({
    queryKey: ['/api/labs'],
    queryFn: () => getAllLabs()
  });

  const toggleMutation = useMutation({
    mutationFn: async (lab: Lab) => {
      await updateLab(lab.id, { attivo: !lab.attivo });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/labs'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteLab(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/labs'] });
      toast({
        title: 'Laboratorio eliminato',
        description: 'Operazione completata con successo'
      });
      setDeletingLab(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-blue-gray">Anagrafica Laboratori</h3>
          <p className="text-sm text-muted-foreground">
            Gestisci i laboratori di stampa per la consegna dei file
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)} data-testid="button-create-lab">
          <Plus className="mr-2 h-4 w-4" />
          Nuovo laboratorio
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : labs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Printer className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Nessun laboratorio configurato</p>
          <p className="text-sm mt-2">Aggiungi il primo laboratorio di stampa</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead className="w-24">Stato</TableHead>
              <TableHead className="text-right w-32">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labs.map((lab) => (
              <TableRow key={lab.id} data-testid={`row-lab-${lab.id}`}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Printer className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{lab.nome}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-sm">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    {lab.email}
                  </div>
                </TableCell>
                <TableCell>
                  {lab.telefono ? (
                    <div className="flex items-center gap-1.5 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {lab.telefono}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={lab.attivo}
                      onCheckedChange={() => toggleMutation.mutate(lab)}
                      disabled={toggleMutation.isPending}
                      data-testid={`switch-lab-status-${lab.id}`}
                    />
                    <Badge variant={lab.attivo ? 'default' : 'secondary'}>
                      {lab.attivo ? 'Attivo' : 'Inattivo'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingLab(lab)}
                      data-testid={`button-edit-lab-${lab.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingLab(lab)}
                      data-testid={`button-delete-lab-${lab.id}`}
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

      {/* Create Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent data-testid="modal-create-lab">
          <DialogHeader>
            <DialogTitle>Nuovo laboratorio</DialogTitle>
            <DialogDescription>
              Aggiungi un nuovo laboratorio di stampa all'anagrafica
            </DialogDescription>
          </DialogHeader>
          <LabForm
            onSuccess={() => setCreateModalOpen(false)}
            onCancel={() => setCreateModalOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      {editingLab && (
        <Dialog open={!!editingLab} onOpenChange={() => setEditingLab(null)}>
          <DialogContent data-testid="modal-edit-lab">
            <DialogHeader>
              <DialogTitle>Modifica laboratorio</DialogTitle>
              <DialogDescription>
                Aggiorna le informazioni del laboratorio
              </DialogDescription>
            </DialogHeader>
            <LabForm
              lab={editingLab}
              onSuccess={() => setEditingLab(null)}
              onCancel={() => setEditingLab(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingLab} onOpenChange={() => setDeletingLab(null)}>
        <AlertDialogContent data-testid="alert-delete-lab">
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il laboratorio "{deletingLab?.nome}"?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-lab">
              Annulla
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingLab && deleteMutation.mutate(deletingLab.id)}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-lab"
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

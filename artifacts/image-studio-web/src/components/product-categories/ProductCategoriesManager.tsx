import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useProductCategories,
  useCreateProductCategory,
  useUpdateProductCategory,
  useDeleteProductCategory,
  useToggleProductCategoryStatus,
  useReorderProductCategories
} from '@/lib/products';
import type { ProductCategory, InsertProductCategory } from '@shared/booking-types';
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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Plus,
  Loader2,
  Edit,
  Trash2,
  ChevronUp,
  ChevronDown,
  Package
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { getProductCategories } from '@/lib/product-categories';

const formSchema = z.object({
  nome: z.string().min(2, 'Nome troppo corto').max(50, 'Nome troppo lungo'),
  value: z
    .string()
    .min(2, 'Valore tecnico troppo corto')
    .max(30, 'Valore tecnico troppo lungo')
    .regex(/^[a-z0-9_-]+$/, 'Usa solo lettere minuscole, numeri, trattini e underscore'),
  attivo: z.boolean()
});

type FormData = z.infer<typeof formSchema>;

interface CategoryFormProps {
  category?: ProductCategory;
  onSuccess: () => void;
  onCancel: () => void;
}

function CategoryForm({ category, onSuccess, onCancel }: CategoryFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createMutation = useCreateProductCategory();
  const updateMutation = useUpdateProductCategory();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: category
      ? {
          nome: category.nome,
          value: category.value,
          attivo: category.attivo
        }
      : {
          nome: '',
          value: '',
          attivo: true
        }
  });

  const handleSubmit = async (data: FormData) => {
    try {
      if (category) {
        await updateMutation.mutateAsync({ id: category.id, data });
        toast({
          title: 'Categoria aggiornata',
          description: 'Modifiche salvate con successo'
        });
      } else {
        // Ottieni tutte le categorie per calcolare displayOrder
        const allCategories = await getProductCategories();
        const maxOrder = Math.max(...allCategories.map((c) => c.displayOrder), 0);
        
        await createMutation.mutateAsync({
          ...data,
          displayOrder: maxOrder + 1
        });
        
        toast({
          title: 'Categoria creata',
          description: 'Nuova categoria aggiunta con successo'
        });
      }
      onSuccess();
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message || 'Operazione fallita',
        variant: 'destructive'
      });
    }
  };

  // Auto-genera value dal nome
  const handleNomeChange = (nome: string) => {
    if (!category) {
      const value = nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      form.setValue('value', value);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="nome"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nome Categoria *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  onChange={(e) => {
                    field.onChange(e);
                    handleNomeChange(e.target.value);
                  }}
                  placeholder="es. Album Fotografico"
                  data-testid="input-category-name"
                />
              </FormControl>
              <FormDescription>Nome visualizzato pubblicamente</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Valore Tecnico *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="es. album_fotografico"
                  disabled={!!category}
                  data-testid="input-category-value"
                />
              </FormControl>
              <FormDescription>
                {category
                  ? 'Il valore tecnico non può essere modificato'
                  : 'Generato automaticamente dal nome (modificabile)'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="attivo"
          render={({ field }) => (
            <FormItem className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel>Stato</FormLabel>
                <FormDescription>
                  Le categorie disattivate non sono visibili nella creazione prodotti
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  data-testid="switch-category-status"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            Annulla
          </Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-category">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {category ? 'Salva modifiche' : 'Crea categoria'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

export default function ProductCategoriesManager() {
  const { data: categories = [], isLoading } = useProductCategories();
  const { toast } = useToast();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; category: ProductCategory | null }>({
    open: false,
    category: null
  });

  const toggleMutation = useToggleProductCategoryStatus();
  const deleteMutation = useDeleteProductCategory();
  const reorderMutation = useReorderProductCategories();

  const handleToggleStatus = async (id: string) => {
    try {
      await toggleMutation.mutateAsync(id);
      toast({
        title: 'Stato aggiornato',
        description: 'Categoria aggiornata con successo'
      });
    } catch (error: any) {
      toast({
        title: 'Errore',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.category) return;
    
    try {
      await deleteMutation.mutateAsync(deleteDialog.category.id);
      toast({
        title: 'Categoria eliminata',
        description: 'Operazione completata con successo'
      });
      setDeleteDialog({ open: false, category: null });
    } catch (error: any) {
      toast({
        title: 'Impossibile eliminare',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...categories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newOrder.length) return;

    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];

    const reorderedIds = newOrder.map((cat) => cat.id);
    reorderMutation.mutate(reorderedIds);
  };

  const openCreateDialog = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const openEditDialog = (category: ProductCategory) => {
    setEditingCategory(category);
    setDialogOpen(true);
  };

  const handleDialogSuccess = () => {
    setDialogOpen(false);
    setEditingCategory(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Categorie Prodotti
              </CardTitle>
              <CardDescription>
                Gestisci le categorie utilizzate per organizzare i tuoi prodotti fotografici
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog} data-testid="button-create-category">
              <Plus className="h-4 w-4 mr-2" />
              Nuova Categoria
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nessuna categoria configurata</h3>
              <p className="text-muted-foreground mb-4">
                Crea la tua prima categoria per organizzare i prodotti
              </p>
              <Button onClick={openCreateDialog} data-testid="button-create-category-empty">
                <Plus className="h-4 w-4 mr-2" />
                Crea Categoria
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ordine</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valore Tecnico</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category, index) => (
                  <TableRow key={category.id}>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMove(index, 'up')}
                          disabled={index === 0 || reorderMutation.isPending}
                          data-testid={`button-move-up-${category.value}`}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleMove(index, 'down')}
                          disabled={index === categories.length - 1 || reorderMutation.isPending}
                          data-testid={`button-move-down-${category.value}`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{category.nome}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{category.value}</code>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={category.attivo}
                        onCheckedChange={() => handleToggleStatus(category.id)}
                        disabled={toggleMutation.isPending}
                        data-testid={`switch-toggle-${category.value}`}
                      />
                      {!category.attivo && (
                        <Badge variant="secondary" className="ml-2">
                          Disattivo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(category)}
                          data-testid={`button-edit-${category.value}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteDialog({ open: true, category })}
                          data-testid={`button-delete-${category.value}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog Crea/Modifica */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Modifica categoria' : 'Nuova categoria'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? 'Aggiorna le informazioni della categoria prodotto'
                : 'Crea una nuova categoria per organizzare i tuoi prodotti'}
            </DialogDescription>
          </DialogHeader>
          <CategoryForm
            category={editingCategory || undefined}
            onSuccess={handleDialogSuccess}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog Conferma Eliminazione */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ open, category: null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare la categoria "{deleteDialog.category?.nome}"?
              <br />
              <br />
              Non puoi eliminare una categoria se ci sono prodotti associati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
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

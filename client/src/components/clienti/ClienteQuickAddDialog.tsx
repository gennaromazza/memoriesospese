import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { createCliente, getClienteById } from '@/lib/clienti';
import { useToast } from '@/hooks/use-toast';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Cliente } from '@shared/clienti-types';

const quickAddSchema = z.object({
  nome: z.string().min(2, 'Nome troppo corto'),
  cognome: z.string().min(2, 'Cognome troppo corto'),
  email: z.string().email('Email non valida'),
  cellulare1: z.string().optional()
});

type FormData = z.infer<typeof quickAddSchema>;

interface ClienteQuickAddDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (cliente: Cliente) => void;
  initialNome?: string;
}

export function ClienteQuickAddDialog({
  open,
  onOpenChange,
  onSuccess,
  initialNome = ''
}: ClienteQuickAddDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(quickAddSchema),
    defaultValues: {
      nome: '',
      cognome: '',
      email: '',
      cellulare1: ''
    }
  });

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const clienteId = await createCliente({
        nome: data.nome,
        cognome: data.cognome,
        email: data.email,
        cellulare1: data.cellulare1 || undefined
      });
      
      const cliente = await getClienteById(clienteId);
      if (!cliente) {
        throw new Error('Cliente creato ma impossibile recuperarlo');
      }
      return cliente;
    },
    onSuccess: (cliente) => {
      queryClient.invalidateQueries({ queryKey: ['clienti'] });
      toast({
        title: 'Cliente creato',
        description: `${cliente.nome} ${cliente.cognome} aggiunto con successo`
      });
      onSuccess(cliente);
      form.reset();
      onOpenChange(false);
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

  const handleCancel = () => {
    form.reset();
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      if (initialNome) {
        const parts = initialNome.trim().split(/\s+/);
        if (parts.length > 1) {
          form.setValue('nome', parts[0]);
          form.setValue('cognome', parts.slice(1).join(' '));
        } else {
          form.setValue('nome', initialNome);
        }
      }
    } else {
      form.reset();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-quick-add-cliente">
        <DialogHeader>
          <DialogTitle>Aggiungi nuovo cliente</DialogTitle>
          <DialogDescription>
            Inserisci i dati essenziali del cliente. Potrai completare il profilo in seguito.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Mario"
                        data-testid="input-nome"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="cognome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cognome *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Rossi"
                        data-testid="input-cognome"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                      placeholder="mario.rossi@example.com"
                      data-testid="input-email"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cellulare1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="tel"
                      placeholder="+39 123 456 7890"
                      data-testid="input-cellulare"
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
                onClick={handleCancel}
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
                Salva cliente
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Cliente } from '@shared/clienti-types';
import { useForm } from 'react-hook-form';

interface EditClienteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: Cliente;
  onSave: (updates: Partial<Cliente>) => Promise<void>;
  isPending?: boolean;
}

interface FormData {
  nome: string;
  cognome: string;
  email: string;
  cellulare1: string;
  whatsapp: string;
}

export default function EditClienteModal({ 
  open, 
  onOpenChange, 
  cliente, 
  onSave, 
  isPending = false 
}: EditClienteModalProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      nome: cliente.nome || '',
      cognome: cliente.cognome || '',
      email: cliente.email || '',
      cellulare1: cliente.cellulare1 || '',
      whatsapp: cliente.whatsapp || ''
    }
  });

  // Reset form when cliente changes
  useEffect(() => {
    reset({
      nome: cliente.nome || '',
      cognome: cliente.cognome || '',
      email: cliente.email || '',
      cellulare1: cliente.cellulare1 || '',
      whatsapp: cliente.whatsapp || ''
    });
  }, [cliente.id, reset, cliente.nome, cliente.cognome, cliente.email, cliente.cellulare1, cliente.whatsapp]);

  const onSubmit = async (data: FormData) => {
    await onSave({
      nome: data.nome,
      cognome: data.cognome,
      email: data.email,
      cellulare1: data.cellulare1,
      whatsapp: data.whatsapp
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-cliente">
        <DialogHeader>
          <DialogTitle>Modifica Cliente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                {...register('nome', { required: 'Nome obbligatorio' })}
                data-testid="input-nome"
              />
              {errors.nome && (
                <p className="text-sm text-destructive mt-1">{errors.nome.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="cognome">Cognome</Label>
              <Input
                id="cognome"
                {...register('cognome', { required: 'Cognome obbligatorio' })}
                data-testid="input-cognome"
              />
              {errors.cognome && (
                <p className="text-sm text-destructive mt-1">{errors.cognome.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              {...register('email', { 
                required: 'Email obbligatoria',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Email non valida'
                }
              })}
              data-testid="input-email"
            />
            {errors.email && (
              <p className="text-sm text-destructive mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="cellulare1">Telefono</Label>
            <Input
              id="cellulare1"
              {...register('cellulare1')}
              placeholder="+39 123 456 7890"
              data-testid="input-cellulare"
            />
          </div>

          <div>
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              {...register('whatsapp')}
              placeholder="+39 123 456 7890"
              data-testid="input-whatsapp"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
              data-testid="button-cancel"
            >
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              data-testid="button-save"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Salvataggio...
                </>
              ) : (
                'Salva Modifiche'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

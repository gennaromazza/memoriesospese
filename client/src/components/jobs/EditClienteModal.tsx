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
  cellulare2: string;
  whatsapp: string;
  via: string;
  citta: string;
  cap: string;
  provincia: string;
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
      cellulare2: cliente.cellulare2 || '',
      whatsapp: cliente.whatsapp || '',
      via: cliente.via || '',
      citta: cliente.citta || '',
      cap: cliente.cap || '',
      provincia: cliente.provincia || ''
    }
  });

  // Reset form when cliente changes
  useEffect(() => {
    reset({
      nome: cliente.nome || '',
      cognome: cliente.cognome || '',
      email: cliente.email || '',
      cellulare1: cliente.cellulare1 || '',
      cellulare2: cliente.cellulare2 || '',
      whatsapp: cliente.whatsapp || '',
      via: cliente.via || '',
      citta: cliente.citta || '',
      cap: cliente.cap || '',
      provincia: cliente.provincia || ''
    });
  }, [cliente.id, reset, cliente.nome, cliente.cognome, cliente.email, cliente.cellulare1, cliente.cellulare2, cliente.whatsapp, cliente.via, cliente.citta, cliente.cap, cliente.provincia]);

  const onSubmit = async (data: FormData) => {
    await onSave({
      nome: data.nome,
      cognome: data.cognome,
      email: data.email,
      cellulare1: data.cellulare1,
      cellulare2: data.cellulare2,
      whatsapp: data.whatsapp,
      via: data.via,
      citta: data.citta,
      cap: data.cap,
      provincia: data.provincia
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-cliente">
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

          {/* Contatti */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="cellulare1">Cellulare Principale</Label>
              <Input
                id="cellulare1"
                {...register('cellulare1')}
                placeholder="+39 123 456 7890"
                data-testid="input-cellulare1"
              />
            </div>

            <div>
              <Label htmlFor="cellulare2">Cellulare Secondario</Label>
              <Input
                id="cellulare2"
                {...register('cellulare2')}
                placeholder="+39 098 765 4321"
                data-testid="input-cellulare2"
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
          </div>

          {/* Indirizzo */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Indirizzo</h3>
            
            <div>
              <Label htmlFor="via">Via</Label>
              <Input
                id="via"
                {...register('via')}
                placeholder="Via Roma, 123"
                data-testid="input-via"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="citta">Città</Label>
                <Input
                  id="citta"
                  {...register('citta')}
                  placeholder="Napoli"
                  data-testid="input-citta"
                />
              </div>

              <div>
                <Label htmlFor="provincia">Provincia</Label>
                <Input
                  id="provincia"
                  {...register('provincia')}
                  placeholder="NA"
                  maxLength={2}
                  data-testid="input-provincia"
                />
              </div>

              <div>
                <Label htmlFor="cap">CAP</Label>
                <Input
                  id="cap"
                  {...register('cap')}
                  placeholder="80100"
                  data-testid="input-cap"
                />
              </div>
            </div>
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

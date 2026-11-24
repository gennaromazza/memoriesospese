import { Cliente, UpdateCliente } from '@shared/clienti-types';
import ClienteForm from '@/components/ClienteForm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface EditClienteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: Cliente;
  onSave: (updates: UpdateCliente) => Promise<void>;
  isPending?: boolean;
}

/**
 * Modifica cliente dal lavoro usando lo stesso form dell'anagrafica.
 * Evita che i due percorsi divergano sui dati fiscali e sull'indirizzo.
 */
export default function EditClienteModal({
  open,
  onOpenChange,
  cliente,
  onSave,
  isPending = false,
}: EditClienteModalProps) {
  const handleSubmit = async (data: UpdateCliente) => {
    try {
      await onSave(data);
      onOpenChange(false);
    } catch {
      // La mutation del chiamante mostra il messaggio di errore e lascia aperto il form.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-edit-cliente">
        <DialogHeader>
          <DialogTitle>Modifica Cliente</DialogTitle>
          <DialogDescription>
            Le modifiche aggiornano l’anagrafica condivisa del cliente in tutto lo studio.
          </DialogDescription>
        </DialogHeader>
        <ClienteForm
          cliente={cliente}
          onSubmit={(data) => { void handleSubmit(data as UpdateCliente); }}
          onCancel={() => onOpenChange(false)}
          isSubmitting={isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClientAutocomplete } from './ClientAutocomplete';
import type { Cliente } from '@shared/clienti-types';

interface AssegnaClienteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (cliente: Cliente) => void;
  excludeClienteIds?: string[];
}

export function AssegnaClienteDialog({
  open,
  onOpenChange,
  onSuccess,
  excludeClienteIds = []
}: AssegnaClienteDialogProps) {
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);

  const handleConfirm = () => {
    if (!selectedCliente) return;
    onSuccess(selectedCliente);
    setSelectedCliente(null);
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) setSelectedCliente(null);
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]" data-testid="dialog-assegna-cliente">
        <DialogHeader>
          <DialogTitle>Associa secondo cliente</DialogTitle>
          <DialogDescription>
            Cerca un cliente esistente oppure creane uno nuovo tramite la voce "Aggiungi nuovo cliente".
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          <ClientAutocomplete
            value={selectedCliente?.id}
            onSelect={(cliente) => setSelectedCliente(cliente)}
            placeholder="Cerca cliente per nome, email o telefono..."
            enableQuickAdd={true}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            type="button"
            disabled={!selectedCliente}
            onClick={handleConfirm}
            data-testid="button-assegna-cliente"
          >
            Assegna cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

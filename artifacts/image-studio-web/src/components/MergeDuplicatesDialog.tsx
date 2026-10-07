import { useState } from 'react';
import { type Cliente } from '@shared/clienti-types';
import { type DuplicateGroup } from '@/lib/clienti';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react';

interface MergeDuplicatesDialogProps {
  duplicateGroup: DuplicateGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmMerge: (primaryId: string, duplicateIds: string[]) => void;
  isLoading?: boolean;
}

export default function MergeDuplicatesDialog({
  duplicateGroup,
  open,
  onOpenChange,
  onConfirmMerge,
  isLoading = false,
}: MergeDuplicatesDialogProps) {
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<string | null>(null);

  // Estrai i dati in modo sicuro con fallback
  const clienti = duplicateGroup?.clienti ?? [];
  const email = duplicateGroup?.email ?? '';
  const count = duplicateGroup?.count ?? 0;

  // Se non ci sono dati validi, non renderizzare nulla
  if (!duplicateGroup || !Array.isArray(clienti) || clienti.length === 0) {
    return null;
  }

  const handleConfirm = () => {
    if (!selectedPrimaryId) return;
    
    const duplicateIds = clienti
      .filter(c => c.id !== selectedPrimaryId)
      .map(c => c.id);
    
    onConfirmMerge(selectedPrimaryId, duplicateIds);
  };

  const getPrimoTelefono = (cliente: Cliente): string => {
    if (cliente.cellulare1 && cliente.cellulare1 !== 'N/D') return cliente.cellulare1;
    if (cliente.whatsapp && cliente.whatsapp !== 'N/D') return cliente.whatsapp;
    if (cliente.cellulare2 && cliente.cellulare2 !== 'N/D') return cliente.cellulare2;
    return '-';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-playfair flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-red-500" />
            Unisci Duplicati: {email}
          </DialogTitle>
          <DialogDescription>
            Trovati <strong>{count}</strong> record con la stessa email. Seleziona il record principale da mantenere. 
            Gli altri duplicati verranno uniti a questo e successivamente eliminati.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={selectedPrimaryId || ''} onValueChange={setSelectedPrimaryId}>
            {clienti.map((cliente, index) => (
              <Card 
                key={cliente.id}
                className={`cursor-pointer transition-all ${
                  selectedPrimaryId === cliente.id 
                    ? 'border-sage border-2 bg-sage/5' 
                    : 'border-gray-200 hover:border-sage/50'
                }`}
                onClick={() => setSelectedPrimaryId(cliente.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <RadioGroupItem 
                      value={cliente.id} 
                      id={cliente.id}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <Label htmlFor={cliente.id} className="cursor-pointer">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-lg">
                              {cliente.nome} {cliente.cognome}
                            </h3>
                            {selectedPrimaryId === cliente.id && (
                              <Badge variant="default" className="bg-sage">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                PRINCIPALE
                              </Badge>
                            )}
                          </div>
                          <Badge variant="outline">Record {index + 1}</Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Email:</span> {cliente.email}
                          </div>
                          <div>
                            <span className="font-medium">Telefono:</span> {getPrimoTelefono(cliente)}
                          </div>
                          <div>
                            <span className="font-medium">Città:</span> {cliente.citta || '-'}
                          </div>
                          <div>
                            <span className="font-medium">Status:</span> {cliente.lifecycle?.status || '-'}
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium">Sources:</span>{' '}
                            <div className="inline-flex gap-2 mt-1">
                              {(cliente.sourceRefs?.bookingIds?.length || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {cliente.sourceRefs.bookingIds.length} Booking
                                </Badge>
                              )}
                              {(cliente.sourceRefs?.orderIds?.length || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {cliente.sourceRefs.orderIds.length} Order
                                </Badge>
                              )}
                              {(cliente.sourceRefs?.passwordRequestIds?.length || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {cliente.sourceRefs.passwordRequestIds?.length} Password Request
                                </Badge>
                              )}
                              {(cliente.sourceRefs?.userIds?.length || 0) > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                  {cliente.sourceRefs.userIds?.length} User
                                </Badge>
                              )}
                            </div>
                          </div>
                          {cliente.note && (
                            <div className="col-span-2">
                              <span className="font-medium">Note:</span>{' '}
                              <p className="text-xs mt-1 text-muted-foreground line-clamp-2">
                                {cliente.note}
                              </p>
                            </div>
                          )}
                        </div>
                      </Label>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </RadioGroup>

          {selectedPrimaryId && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Anteprima Consolidamento
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-gray-700">
                <ul className="space-y-1 list-disc list-inside">
                  <li>Tutti i collegamenti (bookings, orders, galleries, etc.) verranno consolidati nel record principale</li>
                  <li>I dati finanziari verranno sommati (totale revenue, saldo pendente)</li>
                  <li>I campi vuoti nel record principale verranno riempiti dai duplicati</li>
                  <li>Le note verranno unite con separatore "--- MERGE ---"</li>
                  <li>I duplicati ({count - 1}) verranno eliminati permanentemente</li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Annulla
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!selectedPrimaryId || isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? 'Unione in corso...' : `Unisci e Elimina ${count - 1} Duplicati`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

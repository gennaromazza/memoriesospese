import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Plus, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import LabShipmentItem from "./LabShipmentItem";
import { getJobShipments, createShipment } from "@/lib/labShipments";
import { getAllLabs } from "@/lib/labs";
import {
  LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
  type LabShipment,
  type Lab,
} from "@shared/lab-types";

interface LabTrackProps {
  jobId: string;
}

/**
 * Traccia operativa "Laboratorio di stampa": spedizioni file verso i laboratori.
 */
export default function LabTrack({ jobId }: LabTrackProps) {
  const { toast } = useToast();
  const queryKey = ["/api/lab-shipments/job", jobId];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [descrizione, setDescrizione] = useState("");
  const [labId, setLabId] = useState("");
  const [expiryDays, setExpiryDays] = useState(
    String(LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS),
  );

  const shipmentsQuery = useQuery<LabShipment[]>({
    queryKey,
    queryFn: () => getJobShipments(jobId),
  });

  const labsQuery = useQuery<Lab[]>({
    queryKey: ["/api/labs", { attiviOnly: true }],
    queryFn: () => getAllLabs(true),
  });

  const createMut = useMutation({
    mutationFn: () =>
      createShipment({
        jobId,
        descrizione: descrizione.trim() || undefined,
        labId: labId || undefined,
        expiryDays: parseInt(expiryDays, 10) || LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
      }),
    onSuccess: () => {
      toast({
        title: "Spedizione creata",
        description: "Ora puoi caricare i file e inviare il link.",
      });
      setDialogOpen(false);
      setDescrizione("");
      setLabId("");
      setExpiryDays(String(LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS));
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (e: any) =>
      toast({
        title: "Errore",
        description: e.message,
        variant: "destructive",
      }),
  });

  const shipments = shipmentsQuery.data || [];
  const labs = labsQuery.data || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
          <Printer className="h-5 w-5 text-[#8b5a3c]" />
          Laboratorio di stampa
        </h3>
        <Button
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="bg-[#8b5a3c] hover:bg-[#6b4a2c] text-white"
          data-testid="button-new-shipment"
        >
          <Plus className="h-4 w-4 mr-1" />
          Nuova spedizione
        </Button>
      </div>

      {shipmentsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento spedizioni...
        </div>
      ) : shipments.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-2">
          Nessuna spedizione. Crea una spedizione per inviare i file di stampa al
          laboratorio.
        </p>
      ) : (
        <div className="space-y-3">
          {shipments.map((shipment) => (
            <LabShipmentItem
              key={shipment.id}
              shipment={shipment}
              labs={labs}
              jobId={jobId}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova spedizione laboratorio</DialogTitle>
            <DialogDescription>
              Crea una spedizione per inviare i file di stampa a un laboratorio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="ship-desc">Descrizione (opzionale)</Label>
              <Input
                id="ship-desc"
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Es. Album 30x40, stampe fine art..."
                data-testid="input-shipment-desc"
              />
            </div>
            <div>
              <Label>Laboratorio</Label>
              <Select value={labId} onValueChange={setLabId}>
                <SelectTrigger data-testid="select-new-shipment-lab">
                  <SelectValue placeholder="Seleziona laboratorio (opzionale)" />
                </SelectTrigger>
                <SelectContent>
                  {labs.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Nessun laboratorio attivo in anagrafica
                    </SelectItem>
                  ) : (
                    labs.map((lab) => (
                      <SelectItem key={lab.id} value={lab.id}>
                        {lab.nome}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ship-expiry">
                Giorni prima dell'eliminazione automatica
              </Label>
              <Input
                id="ship-expiry"
                type="number"
                min="1"
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                data-testid="input-shipment-expiry"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending}
              className="bg-[#8b5a3c] hover:bg-[#6b4a2c] text-white"
              data-testid="button-create-shipment"
            >
              {createMut.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Crea spedizione
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

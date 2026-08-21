import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2,
  AlertTriangle,
  Calendar,
  Briefcase,
  UserCheck,
  Trash2,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils"; // Assumendo tu abbia questa utility standard di shadcn
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Interfacce
interface ConflictEventMetadata {
  googleEventId?: string;
  [key: string]: unknown;
}

interface ConflictEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  allDay?: boolean;
  source: 'google-calendar' | 'job' | 'booking';
  isDeletable: boolean;
  calendarName?: string;
  metadata: ConflictEventMetadata;
}

interface ConflictResolutionModalProps {
  open: boolean;
  onClose: () => void;
  consultationId?: string;
  onSuccess?: () => void;
}

// Helper per formattazione date (fuori dal componente per performance)
const formatTime = (dateStr: string) => {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(dateStr));
  } catch (e) {
    return dateStr; // Fallback se è già formattato o invalido
  }
};

const SOURCE_CONFIG = {
  "google-calendar": {
    icon: Calendar,
    label: "Google Calendar",
    color: "text-blue-500",
  },
  job: { icon: Briefcase, label: "Job", color: "text-indigo-500" },
  booking: { icon: UserCheck, label: "Prenotazione", color: "text-green-500" },
};

export default function ConflictResolutionModal({
  open,
  onClose,
  consultationId,
  onSuccess,
}: ConflictResolutionModalProps) {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [reason, setReason] = useState("");

  // React Query gestisce il refetch automaticamente quando enabled diventa true
  const { data: conflictData, isLoading: isLoadingConflicts } = useQuery<{
    hasConflict: boolean;
    conflicts: ConflictEvent[];
  }>({
    queryKey: ["/api/consultations/v2", consultationId, "conflicts"],
    enabled: open && !!consultationId && !authLoading && !!user,
    staleTime: 0, // Refetch sempre fresco quando si apre la modale
  });

  // Reset state quando la modale viene chiusa (non quando si apre, per evitare flash)
  useEffect(() => {
    if (!open) {
      // Piccolo delay per evitare che l'UI salti mentre l'animazione di chiusura è in corso
      const timer = setTimeout(() => {
        setSelectedEventIds([]);
        setReason("");
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/consultations/v2/${consultationId}/approve-with-override`,
        {
          overrideConflicts: true,
          deleteEventIds: selectedEventIds,
          reason: reason.trim(),
        },
      );
      return response.json();
    },
    onSuccess: (data) => {
      // Logica toast identica alla tua...
      toast({
        title: "✅ Consulenza approvata",
        description:
          data.deletedEvents.length > 0
            ? `Approvata. ${data.deletedEvents.length} eventi eliminati.`
            : "Approvata con override manuale.",
      });

      if (data.deletionErrors?.length > 0) {
        // Gestione errori parziali...
      }

      queryClient.invalidateQueries({ queryKey: ["/api/consultations"] });
      onSuccess?.();
      onClose();
    },
    // ... onError
  });

  const handleToggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId],
    );
  };

  const conflicts = conflictData?.conflicts || [];
  const deletableCount = conflicts.filter((c) => c.isDeletable).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle>Conflitto Rilevato</DialogTitle>
          </div>
          <DialogDescription>
            Ci sono sovrapposizioni. Approva forzatamente o seleziona gli eventi
            da rimuovere.
          </DialogDescription>
        </DialogHeader>

        {isLoadingConflicts || authLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Analisi disponibilità in corso...
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            {/* Lista Conflitti */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Eventi in Conflitto
                </Label>
                <Badge variant="secondary">{conflicts.length}</Badge>
              </div>

              <div className="space-y-2">
                {conflicts.map((conflict) => {
                  const config =
                    SOURCE_CONFIG[conflict.source as keyof typeof SOURCE_CONFIG] || SOURCE_CONFIG["job"];
                  const Icon = config.icon;
                  const isSelected = selectedEventIds.includes(
                    conflict.metadata.googleEventId || conflict.id,
                  );
                  const eventId =
                    conflict.metadata.googleEventId || conflict.id;

                  return (
                    <div
                      key={conflict.id}
                      className={cn(
                        "flex items-start gap-3 p-3 rounded-lg border transition-all",
                        isSelected
                          ? "bg-destructive/5 border-destructive/20"
                          : "bg-card hover:bg-accent/50",
                      )}
                    >
                      <div className="mt-1">
                        {conflict.isDeletable ? (
                          <Checkbox
                            id={`conflict-${conflict.id}`}
                            checked={isSelected}
                            onCheckedChange={() => handleToggleEvent(eventId)}
                          />
                        ) : (
                          <TooltipProvider>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <AlertTriangle className="h-4 w-4 text-amber-500/50 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  Evento non modificabile da questa piattaforma
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            variant="outline"
                            className="gap-1.5 pl-1.5 font-normal text-muted-foreground"
                          >
                            <Icon className={cn("h-3.5 w-3.5", config.color)} />
                            {config.label}
                          </Badge>
                          {conflict.calendarName && (
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                              • {conflict.calendarName}
                            </span>
                          )}
                        </div>

                        <div
                          className={cn(
                            "font-medium text-sm",
                            isSelected && "line-through text-muted-foreground",
                          )}
                        >
                          {conflict.title}
                        </div>

                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {conflict.allDay ? (
                            <span>Tutto il giorno</span>
                          ) : (
                            <span>
                              {formatTime(conflict.startTime)} -{" "}
                              {formatTime(conflict.endTime)}
                            </span>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <Trash2 className="h-4 w-4 text-destructive opacity-70" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recap Azioni */}
            {deletableCount > 0 && (
              <Alert
                variant={
                  selectedEventIds.length > 0 ? "destructive" : "default"
                }
              >
                <AlertDescription className="flex items-center gap-2">
                  {selectedEventIds.length > 0 ? (
                    <>
                      <Trash2 className="h-4 w-4" /> Verranno eliminati{" "}
                      <strong>{selectedEventIds.length}</strong> eventi dal
                      calendario.
                    </>
                  ) : (
                    <>
                      <Info className="h-4 w-4" /> Puoi selezionare gli eventi
                      da rimuovere automaticamente.
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Reason Input */}
            <div className="space-y-3">
              <Label htmlFor="reason" className="text-base font-semibold">
                Motivazione Override <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="reason"
                placeholder="Es: Il cliente ha chiesto priorità, l'altro evento è stato spostato telefonicamente..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className={cn(
                  "min-h-[100px] resize-none",
                  !reason.trim() &&
                    approveMutation.isError &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 mt-4 border-t">
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={approveMutation.isPending}
          >
            Annulla
          </Button>
          <Button
            onClick={() => approveMutation.mutate()}
            variant={selectedEventIds.length > 0 ? "destructive" : "default"} // Cambio colore se cancella cose
            disabled={
              approveMutation.isPending || isLoadingConflicts || !reason.trim()
            }
          >
            {approveMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {selectedEventIds.length > 0
              ? `Elimina ${selectedEventIds.length} eventi e Approva`
              : "Approva con Conflitto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CONFLICT RESOLUTION MODAL
 * Modal per gestire conflitti di approvazione consultations
 * Permette di:
 * - Visualizzare conflitti dettagliati (Google Calendar, Jobs, Bookings)
 * - Selezionare eventi Google Calendar da cancellare (solo primary calendar)
 * - Fornire motivazione per override
 * - Approvare forzatamente nonostante conflitti
 */

import { useState, useEffect } from "react";
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
import { Loader2, AlertTriangle, Calendar, Briefcase, UserCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConflictEvent {
  id: string;
  title: string;
  source: 'google-calendar' | 'job' | 'booking';
  startTime: string;
  endTime: string;
  allDay: boolean;
  calendarName?: string;
  isDeletable: boolean;
  metadata: {
    jobId?: string;
    bookingId?: string;
    googleEventId?: string;
    calendarId?: string;
  };
}

interface ConflictResolutionModalProps {
  open: boolean;
  onClose: () => void;
  consultationId: string;
  onSuccess?: () => void;
}

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

  // Fetch conflict details (only when authenticated)
  const { data: conflictData, isLoading: isLoadingConflicts } = useQuery<{
    hasConflict: boolean;
    conflicts: ConflictEvent[];
  }>({
    queryKey: ['/api/consultations/v2', consultationId, 'conflicts'],
    enabled: open && !!consultationId && !authLoading && !!user,
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedEventIds([]);
      setReason("");
    }
  }, [open]);

  // Approve with override mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        `/api/consultations/v2/${consultationId}/approve-with-override`,
        {
          method: "POST",
          body: JSON.stringify({
            overrideConflicts: true,
            deleteEventIds: selectedEventIds,
            reason: reason.trim(),
          }),
        }
      );
      return response;
    },
    onSuccess: (data) => {
      toast({
        title: "✅ Consulenza approvata",
        description: data.deletedEvents.length > 0
          ? `Approvata con successo. ${data.deletedEvents.length} eventi eliminati.`
          : "Approvata con successo nonostante i conflitti.",
      });

      if (data.deletionErrors.length > 0) {
        toast({
          title: "⚠️ Alcuni eventi non sono stati eliminati",
          description: data.deletionErrors.join(", "),
          variant: "destructive",
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/consultations"] });
      onSuccess?.();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "❌ Errore approvazione",
        description: error.message || "Impossibile approvare la consulenza",
        variant: "destructive",
      });
    },
  });

  const handleToggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  };

  const handleApprove = () => {
    if (!reason.trim()) {
      toast({
        title: "❌ Motivazione obbligatoria",
        description: "Inserisci una motivazione per l'override del conflitto",
        variant: "destructive",
      });
      return;
    }

    approveMutation.mutate();
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'google-calendar':
        return <Calendar className="h-4 w-4" />;
      case 'job':
        return <Briefcase className="h-4 w-4" />;
      case 'booking':
        return <UserCheck className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'google-calendar':
        return 'Google Calendar';
      case 'job':
        return 'Job';
      case 'booking':
        return 'Booking';
      default:
        return source;
    }
  };

  const conflicts = conflictData?.conflicts || [];
  const deletableCount = conflicts.filter(c => c.isDeletable).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <DialogTitle>Conflitto Rilevato</DialogTitle>
          </div>
          <DialogDescription>
            La consulenza si sovrappone con altri eventi. Puoi approvare comunque o eliminare gli eventi in conflitto.
          </DialogDescription>
        </DialogHeader>

        {(isLoadingConflicts || authLoading) ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Conflicts List */}
            <div className="space-y-2">
              <Label className="text-base font-semibold">
                Eventi in Conflitto ({conflicts.length})
              </Label>
              <div className="space-y-2 border rounded-md p-4 bg-muted/30 max-h-[300px] overflow-y-auto">
                {conflicts.map((conflict) => (
                  <div
                    key={conflict.id}
                    className="flex items-start gap-3 p-3 bg-background rounded-md border"
                  >
                    <div className="mt-1">
                      {conflict.isDeletable ? (
                        <Checkbox
                          id={`conflict-${conflict.id}`}
                          checked={selectedEventIds.includes(conflict.metadata.googleEventId || conflict.id)}
                          onCheckedChange={() =>
                            handleToggleEvent(conflict.metadata.googleEventId || conflict.id)
                          }
                          data-testid={`checkbox-conflict-${conflict.id}`}
                        />
                      ) : (
                        <div className="w-4 h-4" />
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1">
                          {getSourceIcon(conflict.source)}
                          {getSourceLabel(conflict.source)}
                        </Badge>
                        {conflict.calendarName && (
                          <span className="text-xs text-muted-foreground">
                            {conflict.calendarName}
                          </span>
                        )}
                      </div>

                      <div className="font-medium">{conflict.title}</div>

                      <div className="text-sm text-muted-foreground">
                        {conflict.allDay ? (
                          <span>Tutto il giorno</span>
                        ) : (
                          <span>{conflict.startTime} - {conflict.endTime}</span>
                        )}
                      </div>

                      {!conflict.isDeletable && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          Non eliminabile (calendario esterno o evento piattaforma)
                        </div>
                      )}
                    </div>

                    {conflict.isDeletable && selectedEventIds.includes(conflict.metadata.googleEventId || conflict.id) && (
                      <Trash2 className="h-4 w-4 text-destructive mt-1" />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Deletion Info */}
            {deletableCount > 0 && (
              <Alert>
                <AlertDescription>
                  {selectedEventIds.length === 0
                    ? `${deletableCount} eventi possono essere eliminati. Selezionali per eliminarli durante l'approvazione.`
                    : `${selectedEventIds.length} eventi verranno eliminati da Google Calendar.`}
                </AlertDescription>
              </Alert>
            )}

            {/* Reason Input */}
            <div className="space-y-2">
              <Label htmlFor="reason" className="text-base font-semibold">
                Motivazione Override *
              </Label>
              <Textarea
                id="reason"
                placeholder="Spiega perché stai approvando nonostante il conflitto..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                className={!reason.trim() && approveMutation.isError ? 'border-destructive' : ''}
                data-testid="textarea-override-reason"
              />
              <p className="text-xs text-muted-foreground">
                La motivazione verrà salvata nel sistema di audit per tracciabilità.
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={approveMutation.isPending}
            data-testid="button-cancel-override"
          >
            Annulla
          </Button>
          <Button
            onClick={handleApprove}
            disabled={approveMutation.isPending || isLoadingConflicts || !reason.trim()}
            data-testid="button-approve-with-override"
          >
            {approveMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Approvazione...
              </>
            ) : (
              <>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Approva Comunque
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

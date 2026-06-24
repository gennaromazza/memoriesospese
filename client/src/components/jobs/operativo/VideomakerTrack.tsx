import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Video, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getJobAssignments,
  getAllCollaboratori,
  updateMontaggioStatus,
} from "@/lib/collaboratori";
import { convertFirestoreTimestamp } from "@/lib/firebase";
import {
  MONTAGGIO_STATUS_LABELS,
  type MontaggioStatus,
  type JobCollaboratoreAssignment,
  type Collaboratore,
} from "@shared/collaboratori-types";

interface VideomakerTrackProps {
  jobId: string;
}

const MONTAGGIO_OPTIONS: MontaggioStatus[] = [
  "non_richiesto",
  "richiesto",
  "in_lavorazione",
  "consegnato",
];

const MONTAGGIO_BADGE: Record<MontaggioStatus, string> = {
  non_richiesto: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  richiesto: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  in_lavorazione: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  consegnato: "bg-green-100 text-green-700 hover:bg-green-100",
};

function formatDateTime(value: any): string {
  const d = convertFirestoreTimestamp(value);
  if (!d) return "";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MontaggioCard({
  assignment,
  collaboratore,
  jobId,
}: {
  assignment: JobCollaboratoreAssignment;
  collaboratore?: Collaboratore;
  jobId: string;
}) {
  const { toast } = useToast();
  const current: MontaggioStatus = assignment.montaggioStatus || "non_richiesto";
  const [status, setStatus] = useState<MontaggioStatus>(current);
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () => updateMontaggioStatus(assignment.id, status, note.trim() || undefined),
    onSuccess: () => {
      toast({
        title: "Stato montaggio aggiornato",
        description: "Il videomaker ha ricevuto la notifica via email.",
      });
      setNote("");
      queryClient.invalidateQueries({
        queryKey: ["/api/collaboratori/assignments/job", jobId],
      });
    },
    onError: (e: any) =>
      toast({
        title: "Errore",
        description: e.message,
        variant: "destructive",
      }),
  });

  const updates = Array.isArray(assignment.montaggioUpdates)
    ? assignment.montaggioUpdates
    : [];
  const dirty = status !== current || note.trim().length > 0;
  const nome = collaboratore
    ? `${collaboratore.nome} ${collaboratore.cognome}`
    : "Videomaker";

  return (
    <Card className="border border-gray-200" data-testid={`montaggio-${assignment.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-gray-900">{nome}</span>
          <Badge className={MONTAGGIO_BADGE[current]}>
            {MONTAGGIO_STATUS_LABELS[current]}
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Aggiorna stato
            </label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as MontaggioStatus)}
            >
              <SelectTrigger data-testid={`select-montaggio-${assignment.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTAGGIO_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {MONTAGGIO_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Nota (opzionale)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Indicazioni per il videomaker..."
              rows={1}
              className="min-h-[40px]"
              data-testid={`textarea-montaggio-note-${assignment.id}`}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={!dirty || mut.isPending}
            className="bg-[#8b5a3c] hover:bg-[#6b4a2c] text-white"
            data-testid={`button-save-montaggio-${assignment.id}`}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Aggiorna e notifica
          </Button>
        </div>

        {updates.length > 0 && (
          <div className="pt-2 border-t border-gray-100 space-y-1">
            {updates
              .slice()
              .reverse()
              .map((u, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs text-gray-500"
                >
                  <Clock className="h-3 w-3 shrink-0" />
                  <span className="font-medium text-gray-700">
                    {MONTAGGIO_STATUS_LABELS[u.status]}
                  </span>
                  <span>{formatDateTime(u.data)}</span>
                  {u.note ? <span className="italic">· {u.note}</span> : null}
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Traccia operativa "Videomaker": gestione stato montaggio sulle assegnazioni
 * collaboratore con ruolo videomaker per questo lavoro.
 */
export default function VideomakerTrack({ jobId }: VideomakerTrackProps) {
  const assignmentsQuery = useQuery<JobCollaboratoreAssignment[]>({
    queryKey: ["/api/collaboratori/assignments/job", jobId],
    queryFn: () => getJobAssignments(jobId),
  });

  const collaboratoriQuery = useQuery<Collaboratore[]>({
    queryKey: ["/api/collaboratori"],
    queryFn: () => getAllCollaboratori(),
  });

  const videomakerAssignments = (assignmentsQuery.data || []).filter(
    (a) => a.ruoloInJob === "videomaker",
  );
  const collaboratori = collaboratoriQuery.data || [];

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
        <Video className="h-5 w-5 text-[#8b5a3c]" />
        Videomaker — Montaggio
      </h3>

      {assignmentsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento assegnazioni...
        </div>
      ) : videomakerAssignments.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-2">
          Nessun videomaker assegnato. Assegna un collaboratore con ruolo
          videomaker per gestire lo stato del montaggio.
        </p>
      ) : (
        <div className="space-y-3">
          {videomakerAssignments.map((assignment) => (
            <MontaggioCard
              key={assignment.id}
              assignment={assignment}
              collaboratore={collaboratori.find(
                (c) => c.id === assignment.collaboratoreId,
              )}
              jobId={jobId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

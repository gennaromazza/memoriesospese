import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FolderCheck, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  getJobAssignments,
  getAllCollaboratori,
  updateConsegnaFileStatus,
} from "@/lib/collaboratori";
import { convertFirestoreTimestamp } from "@/lib/firebase";
import {
  CONSEGNA_FILE_STATUS_LABELS,
  type ConsegnaFileStatus,
  type JobCollaboratoreAssignment,
  type Collaboratore,
} from "@shared/collaboratori-types";

interface ConsegnaFileTrackProps {
  jobId: string;
}

const RUOLI_LABELS: Record<string, string> = {
  fotografo_secondario: "Fotografo Secondario",
  videomaker: "Videomaker",
  assistente: "Assistente",
  photo_editor: "Photo Editor",
  album_designer: "Album Designer",
  altro: "Altro",
};

const STATUS_BADGE: Record<ConsegnaFileStatus, string> = {
  in_attesa: "bg-gray-100 text-gray-700 hover:bg-gray-100",
  consegnati: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  archiviati: "bg-green-100 text-green-700 hover:bg-green-100",
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

function ConsegnaFileCard({
  assignment,
  collaboratore,
  jobId,
}: {
  assignment: JobCollaboratoreAssignment;
  collaboratore?: Collaboratore;
  jobId: string;
}) {
  const { toast } = useToast();
  const current: ConsegnaFileStatus = assignment.consegnaFileStatus || "in_attesa";
  const [consegnati, setConsegnati] = useState(current !== "in_attesa");
  const [archiviati, setArchiviati] = useState(current === "archiviati");
  const [note, setNote] = useState("");

  const target: ConsegnaFileStatus = archiviati
    ? "archiviati"
    : consegnati
      ? "consegnati"
      : "in_attesa";

  const mut = useMutation({
    mutationFn: () =>
      updateConsegnaFileStatus(assignment.id, target, note.trim() || undefined),
    onSuccess: () => {
      toast({
        title: "Stato file aggiornato",
        description: `Stato impostato su "${CONSEGNA_FILE_STATUS_LABELS[target]}".`,
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

  const updates = Array.isArray(assignment.consegnaFileUpdates)
    ? assignment.consegnaFileUpdates
    : [];
  const dirty = target !== current || note.trim().length > 0;
  const nome = collaboratore
    ? `${collaboratore.nome} ${collaboratore.cognome}`
    : "Collaboratore";
  const ruolo = RUOLI_LABELS[assignment.ruoloInJob] || assignment.ruoloInJob;

  return (
    <Card className="border border-gray-200" data-testid={`consegna-file-${assignment.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-900">{nome}</span>
            <Badge variant="outline" className="text-xs">
              {ruolo}
            </Badge>
          </div>
          <Badge className={STATUS_BADGE[current]}>
            {CONSEGNA_FILE_STATUS_LABELS[current]}
          </Badge>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={consegnati}
              onCheckedChange={(v) => {
                const checked = v === true;
                setConsegnati(checked);
                if (!checked) setArchiviati(false);
              }}
              data-testid={`checkbox-consegnati-${assignment.id}`}
            />
            <span className="text-sm text-gray-700">File consegnati</span>
          </label>
          <label
            className={`flex items-center gap-2 ${consegnati ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
          >
            <Checkbox
              checked={archiviati}
              disabled={!consegnati}
              onCheckedChange={(v) => setArchiviati(v === true)}
              data-testid={`checkbox-archiviati-${assignment.id}`}
            />
            <span className="text-sm text-gray-700">File archiviati</span>
          </label>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1 block">
            Nota (opzionale)
          </label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Es. consegnati su hard disk, archiviati su NAS..."
            rows={1}
            className="min-h-[40px]"
            data-testid={`textarea-consegna-file-note-${assignment.id}`}
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => mut.mutate()}
            disabled={!dirty || mut.isPending}
            className="bg-[#8b5a3c] hover:bg-[#6b4a2c] text-white"
            data-testid={`button-save-consegna-file-${assignment.id}`}
          >
            {mut.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Salva stato
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
                    {CONSEGNA_FILE_STATUS_LABELS[u.status]}
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
 * Traccia operativa "Consegna file": per ogni collaboratore accettato sul lavoro,
 * l'admin segna se i file sono stati consegnati e archiviati. Il collaboratore
 * vede lo stato in sola lettura nella sua dashboard.
 */
export default function ConsegnaFileTrack({ jobId }: ConsegnaFileTrackProps) {
  const assignmentsQuery = useQuery<JobCollaboratoreAssignment[]>({
    queryKey: ["/api/collaboratori/assignments/job", jobId],
    queryFn: () => getJobAssignments(jobId),
  });

  const collaboratoriQuery = useQuery<Collaboratore[]>({
    queryKey: ["/api/collaboratori"],
    queryFn: () => getAllCollaboratori(),
  });

  const acceptedAssignments = (assignmentsQuery.data || []).filter(
    (a) => a.status === "accepted",
  );
  const collaboratori = collaboratoriQuery.data || [];

  return (
    <div className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-gray-900">
        <FolderCheck className="h-5 w-5 text-[#8b5a3c]" />
        Consegna e archiviazione file
      </h3>

      {assignmentsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Caricamento assegnazioni...
        </div>
      ) : acceptedAssignments.length === 0 ? (
        <p className="text-sm text-gray-400 italic py-2">
          Nessun collaboratore accettato su questo lavoro. Lo stato di consegna
          file è disponibile per i collaboratori che hanno accettato l'incarico.
        </p>
      ) : (
        <div className="space-y-3">
          {acceptedAssignments.map((assignment) => (
            <ConsegnaFileCard
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

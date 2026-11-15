import LabTrack from "./LabTrack";
import VideomakerTrack from "./VideomakerTrack";
import ConsegnaFileTrack from "./ConsegnaFileTrack";
import MockupTrack from './MockupTrack';

interface OperationalTracksSectionProps {
  jobId: string;
}

/**
 * Tracce operative del lavoro, INDIPENDENTI dal flusso commerciale:
 * - Laboratorio di stampa (spedizioni file via Google Drive)
 * - Videomaker (stato montaggio sulle assegnazioni collaboratore)
 * - Consegna/archiviazione file (per ogni collaboratore accettato sul lavoro)
 */
export default function OperationalTracksSection({
  jobId,
}: OperationalTracksSectionProps) {
  return (
    <div className="space-y-2" data-testid="operational-tracks">
      <details className="rounded-lg border bg-background">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
          Album, mockup e personalizzazione
        </summary>
        <div className="border-t p-3">
          <MockupTrack jobId={jobId} />
        </div>
      </details>
      <details className="rounded-lg border bg-background">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
          Invii al laboratorio
        </summary>
        <div className="border-t p-3">
          <LabTrack jobId={jobId} />
        </div>
      </details>
      <details className="rounded-lg border bg-background">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
          Videomaker e montaggio
        </summary>
        <div className="border-t p-3">
          <VideomakerTrack jobId={jobId} />
        </div>
      </details>
      <details className="rounded-lg border bg-background">
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">
          Consegna e archiviazione file
        </summary>
        <div className="border-t p-3">
          <ConsegnaFileTrack jobId={jobId} />
        </div>
      </details>
    </div>
  );
}

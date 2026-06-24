import LabTrack from "./LabTrack";
import VideomakerTrack from "./VideomakerTrack";

interface OperationalTracksSectionProps {
  jobId: string;
}

/**
 * Tracce operative del lavoro, INDIPENDENTI dal flusso commerciale:
 * - Laboratorio di stampa (spedizioni file via Google Drive)
 * - Videomaker (stato montaggio sulle assegnazioni collaboratore)
 */
export default function OperationalTracksSection({
  jobId,
}: OperationalTracksSectionProps) {
  return (
    <div className="space-y-6">
      <LabTrack jobId={jobId} />
      <div className="border-t border-gray-100" />
      <VideomakerTrack jobId={jobId} />
    </div>
  );
}

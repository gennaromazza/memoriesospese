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
    <div className="space-y-6">
      <MockupTrack jobId={jobId} />
      <div className="border-t border-gray-100" />
      <LabTrack jobId={jobId} />
      <div className="border-t border-gray-100" />
      <VideomakerTrack jobId={jobId} />
      <div className="border-t border-gray-100" />
      <ConsegnaFileTrack jobId={jobId} />
    </div>
  );
}

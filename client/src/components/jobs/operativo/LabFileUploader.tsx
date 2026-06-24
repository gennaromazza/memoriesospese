import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2 } from "lucide-react";
import { uploadFileToShipment } from "@/lib/labShipments";
import { useToast } from "@/hooks/use-toast";

interface LabFileUploaderProps {
  shipmentId: string;
  disabled?: boolean;
  onUploaded: () => void;
}

/**
 * Caricamento file verso una spedizione laboratorio.
 * Upload resumable diretto browser → Google Drive con barra di avanzamento.
 */
export default function LabFileUploader({
  shipmentId,
  disabled,
  onUploaded,
}: LabFileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [queue, setQueue] = useState<{ index: number; total: number } | null>(
    null,
  );
  const { toast } = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    setUploading(true);
    try {
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        setCurrentName(file.name);
        setQueue({ index: i + 1, total: fileArr.length });
        setProgress(0);
        await uploadFileToShipment(shipmentId, file, (pct) => setProgress(pct));
      }
      toast({
        title: "Upload completato",
        description: `${fileArr.length} file caricati su Google Drive.`,
      });
      onUploaded();
    } catch (error: any) {
      toast({
        title: "Errore upload",
        description: error?.message || "Caricamento fallito",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      setProgress(0);
      setCurrentName("");
      setQueue(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid={`input-file-${shipmentId}`}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploading}
        onClick={() => inputRef.current?.click()}
        data-testid={`button-upload-${shipmentId}`}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <Upload className="h-4 w-4 mr-2" />
        )}
        {uploading ? "Caricamento..." : "Carica file"}
      </Button>
      {uploading && (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground truncate">
            {queue ? `File ${queue.index}/${queue.total}: ` : ""}
            {currentName} ({progress}%)
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}
    </div>
  );
}

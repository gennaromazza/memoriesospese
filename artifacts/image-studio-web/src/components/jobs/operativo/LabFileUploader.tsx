import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { uploadFileToShipment } from "@/lib/labShipments";
import { useToast } from "@/hooks/use-toast";

interface LabFileUploaderProps {
  shipmentId: string;
  disabled?: boolean;
  onUploaded: () => void;
  kind?: "supplemental" | "other";
  label?: string;
  accept?: string;
  onUploadingChange?: (uploading: boolean) => void;
}

/**
 * Caricamento file verso una spedizione laboratorio.
 * Upload resumable diretto browser → Google Drive con barra di avanzamento.
 */
export default function LabFileUploader({
  shipmentId,
  disabled,
  onUploaded,
  kind = "other",
  label = "Carica file",
  accept,
  onUploadingChange,
}: LabFileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [queue, setQueue] = useState<{ index: number; total: number } | null>(
    null,
  );
  const { toast } = useToast();
  const [result, setResult] = useState<{ completed: number; total: number; error?: string } | null>(null);
  const [remainingFiles, setRemainingFiles] = useState<File[]>([]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (disabled || busyRef.current || !files || files.length === 0) return;
    const fileArr = Array.from(files);
    busyRef.current = true;
    setDragging(false);
    dragDepth.current = 0;
    setResult(null);
    setRemainingFiles([]);
    let completed = 0;
    setUploading(true);
    onUploadingChange?.(true);
    try {
      for (let i = 0; i < fileArr.length; i++) {
        const file = fileArr[i];
        setCurrentName(file.name);
        setQueue({ index: i + 1, total: fileArr.length });
        setProgress(0);
        await uploadFileToShipment(
          shipmentId,
          file,
          (pct) => setProgress(pct),
          kind,
        );
        completed++;
      }
      toast({
        title: "Upload completato",
        description: `${fileArr.length} file caricati su Google Drive.`,
      });
      setResult({ completed, total: fileArr.length });
    } catch (error: any) {
      const message = error?.message || "Caricamento fallito";
      setResult({ completed, total: fileArr.length, error: message });
      setRemainingFiles(fileArr.slice(completed));
      toast({
        title: "Errore upload",
        description: `${completed}/${fileArr.length} file caricati. ${message}`,
        variant: "destructive",
      });
    } finally {
      // A partially completed batch has already persisted files on Drive.
      if (completed > 0) onUploaded();
      busyRef.current = false;
      setUploading(false);
      onUploadingChange?.(false);
      setProgress(0);
      setCurrentName("");
      setQueue(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="min-w-0 w-full space-y-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        disabled={disabled || uploading}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        data-testid={`input-file-${shipmentId}`}
      />
      <div
        className={`rounded-md border-2 border-dashed p-3 text-center transition-colors ${
          dragging ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-gray-300 bg-background"
        } ${disabled || uploading ? "opacity-70" : "hover:border-blue-400"}`}
        data-testid={`dropzone-${shipmentId}`}
        aria-label="Area di caricamento file per il laboratorio"
        aria-busy={uploading}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          dragDepth.current++;
          if (!disabled && !busyRef.current) setDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = disabled || busyRef.current ? "none" : "copy";
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          dragDepth.current = 0;
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
      >
        <p className="mb-2 text-xs text-muted-foreground">
          {uploading ? "Caricamento in corso: attendi prima di aggiungere altri file."
            : disabled ? "Caricamento momentaneamente non disponibile."
            : dragging ? "Rilascia qui i file per caricarli" : "Trascina qui foto e file, oppure sfoglia"}
        </p>
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
        {uploading ? "Caricamento..." : `${label} · Sfoglia`}
      </Button>
      </div>
      {uploading && (
        <div className="space-y-1" role="status" aria-live="polite">
          <div className="break-words text-xs text-muted-foreground">
            {queue ? `File ${queue.index}/${queue.total}: ` : ""}
            {currentName} ({progress}%)
          </div>
          <Progress value={progress} className="h-2" />
          {queue && queue.total > 1 && (
            <>
              <p className="text-xs text-muted-foreground">Gruppo di file: {Math.round(((queue.index - 1) * 100 + progress) / queue.total)}%</p>
              <Progress value={((queue.index - 1) * 100 + progress) / queue.total} className="h-2" />
            </>
          )}
        </div>
      )}
      {!uploading && result && (
        <div role={result.error ? "alert" : "status"} className={`rounded border p-2 text-xs ${
          result.error ? "border-amber-300 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"
        }`}>
          <p className="flex items-start gap-1.5">
            {result.error ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
            {result.completed}/{result.total} file caricati{result.error ? ` · ${result.error}` : " su Drive. Puoi ora inviare il link al laboratorio."}
          </p>
          {remainingFiles.length > 0 && (
            <div className="mt-2 space-y-2">
              <p>Restano {remainingFiles.length} file da caricare. Quelli completati sono già visibili nella spedizione.</p>
              <Button type="button" size="sm" variant="outline" disabled={disabled}
                onClick={() => void handleFiles(remainingFiles)}
                data-testid={`retry-upload-${shipmentId}`}>
                Riprova i {remainingFiles.length} file rimanenti
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

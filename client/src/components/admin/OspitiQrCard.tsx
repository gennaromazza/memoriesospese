import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { QrCode, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createAbsoluteUrl } from "@/lib/basePath";

export default function OspitiQrCard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const ospitiUrl = createAbsoluteUrl("/ospiti");

  const handleDownload = () => {
    const canvas = containerRef.current?.querySelector("canvas");
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = "qr-pagina-ospiti.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="rounded-xl border border-stone-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-stone-50 border-b border-stone-200">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#6b7f6b]/15">
          <QrCode className="h-3.5 w-3.5 text-[#6b7f6b]" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-stone-700">
            QR Code Pagina Ospiti
          </h3>
          <p className="text-xs text-stone-400">
            Stampa il QR ed esponilo all'evento: gli ospiti accedono ai contatti
            e alla ricerca galleria
          </p>
        </div>
      </div>
      <div className="p-5 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div
          ref={containerRef}
          className="rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
        >
          <QRCodeCanvas
            value={ospitiUrl}
            size={180}
            level="M"
            includeMargin={false}
            fgColor="#3f4a52"
          />
        </div>
        <div className="flex-1 text-center sm:text-left">
          <p className="text-xs text-stone-500 break-all">{ospitiUrl}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleDownload}
              className="bg-[#6b7f6b] hover:bg-[#5a6e5a] text-white gap-2"
              data-testid="button-download-qr-ospiti"
            >
              <Download className="h-4 w-4" />
              Scarica QR Code
            </Button>
            <Button
              variant="outline"
              asChild
              className="gap-2 border-stone-200"
            >
              <a
                href={ospitiUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-open-ospiti"
              >
                <ExternalLink className="h-4 w-4" />
                Apri pagina
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

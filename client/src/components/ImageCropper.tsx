import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card } from '@/components/ui/card';
import { Smartphone, Monitor, Upload, RotateCw } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ImageCropperProps {
  image: string;
  onCropComplete: (mobileBlob: Blob | null, desktopBlob: Blob | null) => void;
  onCancel: () => void;
}

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function ImageCropper({ image, onCropComplete, onCancel }: ImageCropperProps) {
  const [activeTab, setActiveTab] = useState<'mobile' | 'desktop'>('mobile');
  const [mobileCrop, setMobileCrop] = useState<CropArea>({ x: 0, y: 0, width: 100, height: 100 });
  const [desktopCrop, setDesktopCrop] = useState<CropArea>({ x: 0, y: 0, width: 100, height: 100 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mobilePreviewRef = useRef<HTMLCanvasElement>(null);
  const desktopPreviewRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Carica immagine e calcola crop ottimali
  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => {
      imgRef.current = img;
      
      // Calcola crop areas basate sull'immagine reale per ottenere ratio corretti
      const imgWidth = img.width;
      const imgHeight = img.height;
      const imgRatio = imgWidth / imgHeight;
      
      // Mobile 9:16 (ratio 0.5625)
      const mobileRatio = 9 / 16;
      let mobileWidth, mobileHeight, mobileX, mobileY;
      
      if (imgRatio > mobileRatio) {
        // Immagine più larga: limita per altezza
        mobileHeight = 100;
        mobileWidth = (mobileRatio * imgHeight / imgWidth) * 100;
        mobileX = (100 - mobileWidth) / 2;
        mobileY = 0;
      } else {
        // Immagine più alta: limita per larghezza
        mobileWidth = 100;
        mobileHeight = (imgWidth / mobileRatio / imgHeight) * 100;
        mobileX = 0;
        mobileY = (100 - mobileHeight) / 2;
      }
      
      // Desktop 16:9 (ratio 1.778)
      const desktopRatio = 16 / 9;
      let desktopWidth, desktopHeight, desktopX, desktopY;
      
      if (imgRatio > desktopRatio) {
        // Immagine più larga: limita per altezza
        desktopHeight = 100;
        desktopWidth = (desktopRatio * imgHeight / imgWidth) * 100;
        desktopX = (100 - desktopWidth) / 2;
        desktopY = 0;
      } else {
        // Immagine più alta: limita per larghezza
        desktopWidth = 100;
        desktopHeight = (imgWidth / desktopRatio / imgHeight) * 100;
        desktopX = 0;
        desktopY = (100 - desktopHeight) / 2;
      }
      
      setMobileCrop({ x: mobileX, y: mobileY, width: mobileWidth, height: mobileHeight });
      setDesktopCrop({ x: desktopX, y: desktopY, width: desktopWidth, height: desktopHeight });
      
      drawCanvas();
    };
  }, [image]);

  // Ridisegna quando cambiano crop, zoom o rotazione
  useEffect(() => {
    drawCanvas();
  }, [mobileCrop, desktopCrop, zoom, rotation, activeTab]);

  const drawCanvas = () => {
    if (!canvasRef.current || !imgRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imgRef.current;
    const crop = activeTab === 'mobile' ? mobileCrop : desktopCrop;

    // Imposta dimensioni canvas
    canvas.width = 800;
    canvas.height = 600;

    // Pulisci canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Applica trasformazioni
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // Disegna area di crop
    const cropX = (crop.x / 100) * canvas.width;
    const cropY = (crop.y / 100) * canvas.height;
    const cropWidth = (crop.width / 100) * canvas.width;
    const cropHeight = (crop.height / 100) * canvas.height;

    // Overlay scuro
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Area di crop trasparente
    ctx.clearRect(cropX, cropY, cropWidth, cropHeight);

    // Bordo area di crop
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropWidth, cropHeight);

    // Aggiorna preview
    updatePreview();
  };

  const updatePreview = () => {
    if (!imgRef.current) return;

    const img = imgRef.current;

    // Crea canvas temporaneo con trasformazioni
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    const scaledWidth = img.width * zoom;
    const scaledHeight = img.height * zoom;
    tempCanvas.width = scaledWidth;
    tempCanvas.height = scaledHeight;

    tempCtx.save();
    tempCtx.translate(scaledWidth / 2, scaledHeight / 2);
    tempCtx.rotate((rotation * Math.PI) / 180);
    tempCtx.scale(zoom, zoom);
    tempCtx.drawImage(img, -img.width / 2, -img.height / 2);
    tempCtx.restore();

    // Preview Mobile (9:16)
    if (mobilePreviewRef.current) {
      const canvas = mobilePreviewRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 180;
        canvas.height = 320;
        
        const cropX = (mobileCrop.x / 100) * scaledWidth;
        const cropY = (mobileCrop.y / 100) * scaledHeight;
        const cropWidth = (mobileCrop.width / 100) * scaledWidth;
        const cropHeight = (mobileCrop.height / 100) * scaledHeight;

        ctx.drawImage(
          tempCanvas,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, canvas.width, canvas.height
        );
      }
    }

    // Preview Desktop (16:9)
    if (desktopPreviewRef.current) {
      const canvas = desktopPreviewRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = 320;
        canvas.height = 180;
        
        const cropX = (desktopCrop.x / 100) * scaledWidth;
        const cropY = (desktopCrop.y / 100) * scaledHeight;
        const cropWidth = (desktopCrop.width / 100) * scaledWidth;
        const cropHeight = (desktopCrop.height / 100) * scaledHeight;

        ctx.drawImage(
          tempCanvas,
          cropX, cropY, cropWidth, cropHeight,
          0, 0, canvas.width, canvas.height
        );
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;

    const deltaX = ((e.clientX - dragStart.x) / 800) * 100;
    const deltaY = ((e.clientY - dragStart.y) / 600) * 100;

    const crop = activeTab === 'mobile' ? mobileCrop : desktopCrop;
    const setCrop = activeTab === 'mobile' ? setMobileCrop : setDesktopCrop;

    setCrop({
      ...crop,
      x: Math.max(0, Math.min(100 - crop.width, crop.x + deltaX)),
      y: Math.max(0, Math.min(100 - crop.height, crop.y + deltaY))
    });

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const getCroppedBlob = (cropArea: CropArea): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!imgRef.current) {
        resolve(null);
        return;
      }

      const img = imgRef.current;
      
      // Crea canvas temporaneo per applicare trasformazioni
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) {
        resolve(null);
        return;
      }

      // Dimensioni canvas temporaneo basate su zoom
      const scaledWidth = img.width * zoom;
      const scaledHeight = img.height * zoom;
      tempCanvas.width = scaledWidth;
      tempCanvas.height = scaledHeight;

      // Applica rotazione e zoom
      tempCtx.save();
      tempCtx.translate(scaledWidth / 2, scaledHeight / 2);
      tempCtx.rotate((rotation * Math.PI) / 180);
      tempCtx.scale(zoom, zoom);
      tempCtx.drawImage(img, -img.width / 2, -img.height / 2);
      tempCtx.restore();

      // Calcola area di crop sul canvas trasformato
      const cropX = (cropArea.x / 100) * scaledWidth;
      const cropY = (cropArea.y / 100) * scaledHeight;
      const cropWidth = (cropArea.width / 100) * scaledWidth;
      const cropHeight = (cropArea.height / 100) * scaledHeight;

      // Canvas finale per il crop
      const finalCanvas = document.createElement('canvas');
      const finalCtx = finalCanvas.getContext('2d');
      if (!finalCtx) {
        resolve(null);
        return;
      }

      finalCanvas.width = cropWidth;
      finalCanvas.height = cropHeight;

      // Copia l'area croppata
      finalCtx.drawImage(
        tempCanvas,
        cropX, cropY, cropWidth, cropHeight,
        0, 0, finalCanvas.width, finalCanvas.height
      );

      finalCanvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.92);
    });
  };

  const handleSave = async () => {
    const mobileBlob = await getCroppedBlob(mobileCrop);
    const desktopBlob = await getCroppedBlob(desktopCrop);
    onCropComplete(mobileBlob, desktopBlob);
  };

  return (
    <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-7xl w-full max-h-[95vh] overflow-auto">
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">Ritaglia Immagine di Copertina</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Area di crop principale */}
            <div className="lg:col-span-2">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'mobile' | 'desktop')}>
                <TabsList className="mb-4">
                  <TabsTrigger value="mobile" className="flex items-center gap-2">
                    <Smartphone className="w-4 h-4" />
                    Mobile (9:16)
                  </TabsTrigger>
                  <TabsTrigger value="desktop" className="flex items-center gap-2">
                    <Monitor className="w-4 h-4" />
                    Desktop (16:9)
                  </TabsTrigger>
                </TabsList>

                <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto cursor-move"
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                  />
                </div>
              </Tabs>

              {/* Controlli */}
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Zoom</label>
                  <Slider
                    value={[zoom]}
                    onValueChange={(v) => setZoom(v[0])}
                    min={0.5}
                    max={3}
                    step={0.1}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Rotazione</label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[rotation]}
                      onValueChange={(v) => setRotation(v[0])}
                      min={-180}
                      max={180}
                      step={5}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setRotation(0)}
                      data-testid="button-reset-rotation"
                    >
                      <RotateCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" />
                  Preview Mobile
                </h3>
                <div className="flex justify-center bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <canvas
                    ref={mobilePreviewRef}
                    className="max-w-full h-auto border-2 border-gray-300 dark:border-gray-700 rounded"
                  />
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Monitor className="w-4 h-4" />
                  Preview Desktop
                </h3>
                <div className="flex justify-center bg-gray-100 dark:bg-gray-800 rounded-lg p-4">
                  <canvas
                    ref={desktopPreviewRef}
                    className="max-w-full h-auto border-2 border-gray-300 dark:border-gray-700 rounded"
                  />
                </div>
              </Card>
            </div>
          </div>

          {/* Azioni */}
          <div className="flex justify-end gap-3 mt-6">
            <Button
              variant="outline"
              onClick={onCancel}
              data-testid="button-cancel-crop"
            >
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              className="bg-terracotta-600 hover:bg-terracotta-700"
              data-testid="button-save-crop"
            >
              Salva Ritagli
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

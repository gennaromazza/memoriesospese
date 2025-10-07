import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { Smartphone, Monitor, RotateCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ImageCropperProps {
  image: string;
  onCropComplete: (mobileBlob: Blob | null, desktopBlob: Blob | null) => void;
  onCancel: () => void;
}

interface CropArea {
  x: number; // percent
  y: number; // percent
  width: number; // percent
  height: number; // percent
}

const DPR =
  typeof window !== "undefined" ? Math.max(1, window.devicePixelRatio || 1) : 1;

function rotatedBBox(w: number, h: number, rad: number) {
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  return {
    width: w * cos + h * sin,
    height: w * sin + h * cos,
  };
}

export function ImageCropper({
  image,
  onCropComplete,
  onCancel,
}: ImageCropperProps) {
  const [activeTab, setActiveTab] = useState<"mobile" | "desktop">("mobile");
  const [mobileCrop, setMobileCrop] = useState<CropArea>({
    x: 0,
    y: 0,
    width: 56.25,
    height: 100,
  }); // 9:16
  const [desktopCrop, setDesktopCrop] = useState<CropArea>({
    x: 0,
    y: 0,
    width: 100,
    height: 56.25,
  }); // 16:9
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mobilePreviewRef = useRef<HTMLCanvasElement>(null);
  const desktopPreviewRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Lock body scroll while modal open
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  // Keyboard: Esc to close, arrows to nudge crop
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
        return;
      }
      const stepBase = e.shiftKey ? 2 : 0.5; // percent
      let dx = 0,
        dy = 0;
      if (e.key === "ArrowLeft") dx = -stepBase;
      if (e.key === "ArrowRight") dx = stepBase;
      if (e.key === "ArrowUp") dy = -stepBase;
      if (e.key === "ArrowDown") dy = stepBase;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        const crop = activeTab === "mobile" ? mobileCrop : desktopCrop;
        const setCrop = activeTab === "mobile" ? setMobileCrop : setDesktopCrop;
        setCrop({
          ...crop,
          x: Math.max(0, Math.min(100 - crop.width, crop.x + dx)),
          y: Math.max(0, Math.min(100 - crop.height, crop.y + dy)),
        });
      }
    };
    document.addEventListener("keydown", handler, { capture: true });
    return () =>
      document.removeEventListener("keydown", handler, { capture: true });
  }, [activeTab, mobileCrop, desktopCrop, onCancel]);

  // Load image + initial crops centrati
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = image;
    img.onload = () => {
      imgRef.current = img;

      const iw = img.width;
      const ih = img.height;
      const imgRatio = iw / ih;

      // mobile 9:16
      const mobileR = 9 / 16;
      let mW, mH, mX, mY;
      if (imgRatio > mobileR) {
        mH = 100;
        mW = ((mobileR * ih) / iw) * 100;
        mX = (100 - mW) / 2;
        mY = 0;
      } else {
        mW = 100;
        mH = (iw / mobileR / ih) * 100;
        mX = 0;
        mY = (100 - mH) / 2;
      }

      // desktop 16:9
      const desktopR = 16 / 9;
      let dW, dH, dX, dY;
      if (imgRatio > desktopR) {
        dH = 100;
        dW = ((desktopR * ih) / iw) * 100;
        dX = (100 - dW) / 2;
        dY = 0;
      } else {
        dW = 100;
        dH = (iw / desktopR / ih) * 100;
        dX = 0;
        dY = (100 - dH) / 2;
      }

      setMobileCrop({ x: mX, y: mY, width: mW, height: mH });
      setDesktopCrop({ x: dX, y: dY, width: dW, height: dH });

      drawCanvas();
      // focus the panel for keyboard
      setTimeout(() => panelRef.current?.focus(), 0);
    };
  }, [image]);

  // redraw on changes
  useEffect(() => {
    drawCanvas();
  }, [mobileCrop, desktopCrop, zoom, rotation, activeTab]);

  // wheel zoom sulla canvas (blocca scroll pagina)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom((z) => Math.min(3, Math.max(0.5, +(z + delta).toFixed(2))));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const handlePointerDownOverlay: React.PointerEventHandler<HTMLDivElement> = (
    e,
  ) => {
    // chiudi solo se il target è il backdrop (non un figlio)
    if (e.target === e.currentTarget) onCancel();
  };

  const handlePointerDownPanel: React.PointerEventHandler<HTMLDivElement> = (
    e,
  ) => {
    // blocca bubbling, così il click non arriva all’overlay
    e.stopPropagation();
  };

  // drag on canvas (mouse/touch/pen via pointer events)
  const onCanvasPointerDown: React.PointerEventHandler<HTMLCanvasElement> = (
    e,
  ) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  const onCanvasPointerMove: React.PointerEventHandler<HTMLCanvasElement> = (
    e,
  ) => {
    if (!isDragging) return;
    handleDragDelta(e.clientX, e.clientY);
  };
  const onCanvasPointerUp: React.PointerEventHandler<HTMLCanvasElement> = (
    e,
  ) => {
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    setIsDragging(false);
  };

  const handleDragDelta = (cx: number, cy: number) => {
    const baseW = 800;
    const baseH = 600;
    const deltaX = ((cx - dragStart.x) / baseW) * 100;
    const deltaY = ((cy - dragStart.y) / baseH) * 100;

    const crop = activeTab === "mobile" ? mobileCrop : desktopCrop;
    const setCrop = activeTab === "mobile" ? setMobileCrop : setDesktopCrop;

    setCrop({
      ...crop,
      x: Math.max(0, Math.min(100 - crop.width, crop.x + deltaX)),
      y: Math.max(0, Math.min(100 - crop.height, crop.y + deltaY)),
    });
    setDragStart({ x: cx, y: cy });
  };

  const drawCanvas = () => {
    if (!canvasRef.current || !imgRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // canvas di lavoro 800x600 (nitido con DPR)
    canvas.width = 800 * DPR;
    canvas.height = 600 * DPR;
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // clear
    ctx.clearRect(0, 0, 800, 600);

    // disegna immagine centrata con zoom/rotazione
    const img = imgRef.current;
    ctx.save();
    ctx.translate(400, 300);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();

    // crop overlay
    const crop = activeTab === "mobile" ? mobileCrop : desktopCrop;
    const cropX = (crop.x / 100) * 800;
    const cropY = (crop.y / 100) * 600;
    const cropW = (crop.width / 100) * 800;
    const cropH = (crop.height / 100) * 600;

    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(0, 0, 800, 600);
    ctx.clearRect(cropX, cropY, cropW, cropH);
    ctx.strokeStyle = "#f97316";
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);

    updatePreview();
  };

  const updatePreview = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;

    const rad = (rotation * Math.PI) / 180;
    const transformedW = img.width * zoom;
    const transformedH = img.height * zoom;
    const bbox = rotatedBBox(transformedW, transformedH, rad);

    const temp = document.createElement("canvas");
    temp.width = Math.max(1, Math.round(bbox.width));
    temp.height = Math.max(1, Math.round(bbox.height));
    const tctx = temp.getContext("2d");
    if (!tctx) return;

    tctx.save();
    tctx.translate(temp.width / 2, temp.height / 2);
    tctx.rotate(rad);
    tctx.scale(zoom, zoom);
    tctx.drawImage(img, -img.width / 2, -img.height / 2);
    tctx.restore();

    const copyToPreview = (
      previewCanvas: HTMLCanvasElement | null,
      cropArea: CropArea,
      targetW: number,
      targetH: number,
    ) => {
      if (!previewCanvas) return;
      const pctx = previewCanvas.getContext("2d");
      if (!pctx) return;

      previewCanvas.width = targetW * DPR;
      previewCanvas.height = targetH * DPR;
      previewCanvas.style.width = `${targetW}px`;
      previewCanvas.style.height = `${targetH}px`;
      pctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      pctx.clearRect(0, 0, targetW, targetH);

      const viewportW = 800;
      const viewportH = 600;
      const offsetX = (bbox.width - viewportW) / 2;
      const offsetY = (bbox.height - viewportH) / 2;

      const sx = (cropArea.x / 100) * viewportW + offsetX;
      const sy = (cropArea.y / 100) * viewportH + offsetY;
      const sw = (cropArea.width / 100) * viewportW;
      const sh = (cropArea.height / 100) * viewportH;

      pctx.drawImage(temp, sx, sy, sw, sh, 0, 0, targetW, targetH);
    };

    copyToPreview(mobilePreviewRef.current, mobileCrop, 180, 320);
    copyToPreview(desktopPreviewRef.current, desktopCrop, 320, 180);
  };

  const getCroppedBlob = (
    cropArea: CropArea,
    outW: number,
    outH: number,
  ): Promise<Blob | null> => {
    return new Promise((resolve) => {
      if (!imgRef.current) return resolve(null);
      const img = imgRef.current;

      const rad = (rotation * Math.PI) / 180;
      const transformedW = img.width * zoom;
      const transformedH = img.height * zoom;
      const bbox = rotatedBBox(transformedW, transformedH, rad);

      const temp = document.createElement("canvas");
      temp.width = Math.max(1, Math.round(bbox.width));
      temp.height = Math.max(1, Math.round(bbox.height));
      const tctx = temp.getContext("2d");
      if (!tctx) return resolve(null);

      tctx.save();
      tctx.translate(temp.width / 2, temp.height / 2);
      tctx.rotate(rad);
      tctx.scale(zoom, zoom);
      tctx.drawImage(img, -img.width / 2, -img.height / 2);
      tctx.restore();

      const viewportW = 800;
      const viewportH = 600;
      const offsetX = (bbox.width - viewportW) / 2;
      const offsetY = (bbox.height - viewportH) / 2;

      const sx = (cropArea.x / 100) * viewportW + offsetX;
      const sy = (cropArea.y / 100) * viewportH + offsetY;
      const sw = (cropArea.width / 100) * viewportW;
      const sh = (cropArea.height / 100) * viewportH;

      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = outW;
      finalCanvas.height = outH;
      const fctx = finalCanvas.getContext("2d");
      if (!fctx) return resolve(null);

      fctx.drawImage(temp, sx, sy, sw, sh, 0, 0, outW, outH);
      finalCanvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
    });
  };

  const handleSave = async () => {
    const mobileBlob = await getCroppedBlob(mobileCrop, 1080, 1920);
    const desktopBlob = await getCroppedBlob(desktopCrop, 1920, 1080);
    onCropComplete(mobileBlob, desktopBlob);
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4"
      onPointerDown={handlePointerDownOverlay}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-white dark:bg-gray-900 rounded-lg max-w-7xl w-full max-h-[95vh] overflow-auto outline-none"
        onPointerDown={handlePointerDownPanel}
      >
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4">
            Ritaglia Immagine di Copertina
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Area di crop */}
            <div className="lg:col-span-2">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as "mobile" | "desktop")}
              >
                <TabsList className="mb-4">
                  <TabsTrigger
                    value="mobile"
                    className="flex items-center gap-2"
                  >
                    <Smartphone className="w-4 h-4" />
                    Mobile (9:16)
                  </TabsTrigger>
                  <TabsTrigger
                    value="desktop"
                    className="flex items-center gap-2"
                  >
                    <Monitor className="w-4 h-4" />
                    Desktop (16:9)
                  </TabsTrigger>
                </TabsList>

                <div className="relative bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-auto cursor-move touch-none"
                    onPointerDown={onCanvasPointerDown}
                    onPointerMove={onCanvasPointerMove}
                    onPointerUp={onCanvasPointerUp}
                    onPointerCancel={onCanvasPointerUp}
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
                  <label className="text-sm font-medium mb-2 block">
                    Rotazione
                  </label>
                  <div className="flex items-center gap-2">
                    <Slider
                      value={[rotation]}
                      onValueChange={(v) => setRotation(v[0])}
                      min={-180}
                      max={180}
                      step={1}
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setRotation(0)}
                      data-testid="button-reset-rotation"
                      title="Reset rotazione"
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

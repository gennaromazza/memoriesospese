import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Calendar, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import libroPdf from "@assets/lasciati-trasportare.pdf";

// Configure PDF.js worker - Vite-compatible local worker
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export default function LasciatiTrasportarePage() {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const goToPrevPage = () => setPageNumber(prev => Math.max(prev - 1, 1));
  const goToNextPage = () => setPageNumber(prev => Math.min(prev + 1, numPages || 1));
  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 2.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.6));

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      <nav className="border-b border-beige sticky top-0 bg-white/80 backdrop-blur-md z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link href="/">
            <Button variant="ghost" className="text-sage hover:text-dark-sage">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Home
            </Button>
          </Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-playfair text-blue-gray mb-4">
            Lasciati Trasportare
          </h1>
          <p className="text-2xl text-gray-600 mb-2">
            di Gennaro Mazzacane
          </p>
          <p className="text-lg text-gray-500">
            La guida completa per organizzare il tuo matrimonio perfetto
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 mb-16">
          {/* Book Preview */}
          <div>
            <div className="aspect-[3/4] bg-gradient-to-br from-sage to-dark-sage rounded-2xl shadow-2xl flex items-center justify-center text-white p-12">
              <div className="text-center">
                <h2 className="text-4xl font-playfair mb-4">LASCIATI</h2>
                <h2 className="text-4xl font-playfair mb-8">TRASPORTARE</h2>
                <p className="text-xl">di Gennaro Mazzacane</p>
              </div>
            </div>
          </div>

          {/* Book Info */}
          <div>
            <h2 className="text-3xl font-playfair text-blue-gray mb-6">
              Un Viaggio Emozionante
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              "Lasciati Trasportare" è un viaggio emozionante attraverso il mondo dei matrimoni 
              e della fotografia, un'esperienza avvincente e coinvolgente.
            </p>
            <p className="text-lg text-gray-600 mb-8">
              Come un viaggiatore curioso che si addentra in nuove terre, questo libro ti invita 
              a esplorare i confini del matrimonio, del racconto e dell'immortalare emozioni.
            </p>

            <div className="bg-white rounded-lg p-6 shadow-lg mb-8">
              <h3 className="font-semibold text-xl mb-4">Cosa troverai:</h3>
              <ul className="space-y-3">
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Chi sono e perché ho scritto questo libro</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Perché specializzarsi nei matrimoni</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Questione di prospettive e autenticità</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Consigli pratici per il tuo matrimonio</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>Gestione problemi durante l'evento</span>
                </li>
                <li className="flex items-start">
                  <span className="text-sage mr-2">✓</span>
                  <span>L'importanza della fotografia stampata</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <a href={libroPdf} download="Lasciati-Trasportare.pdf" target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button size="lg" className="bg-sage hover:bg-dark-sage text-white w-full">
                  <Download className="mr-2 h-5 w-5" />
                  Scarica GRATIS (PDF)
                </Button>
              </a>
              <Link href="/prenota" className="flex-1">
                <Button size="lg" variant="outline" className="border-sage text-sage hover:bg-sage/10 w-full">
                  <Calendar className="mr-2 h-5 w-5" />
                  Prenota Consulenza
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Embedded PDF Reader */}
        <div className="bg-white rounded-2xl shadow-2xl p-4 sm:p-8">
          <h3 className="text-2xl font-playfair text-center mb-6">Anteprima Libro</h3>
          
          {/* PDF Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 p-4 bg-sage/5 rounded-lg">
            <div className="flex items-center gap-2">
              <Button
                onClick={goToPrevPage}
                disabled={pageNumber <= 1}
                variant="outline"
                size="sm"
                className="border-sage text-sage hover:bg-sage/10"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span className="text-sm font-medium text-gray-700 min-w-[120px] text-center">
                Pagina {pageNumber} {numPages && `di ${numPages}`}
              </span>
              
              <Button
                onClick={goToNextPage}
                disabled={pageNumber >= (numPages || 1)}
                variant="outline"
                size="sm"
                className="border-sage text-sage hover:bg-sage/10"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                onClick={zoomOut}
                disabled={scale <= 0.6}
                variant="outline"
                size="sm"
                className="border-sage text-sage hover:bg-sage/10"
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              
              <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              
              <Button
                onClick={zoomIn}
                disabled={scale >= 2.0}
                variant="outline"
                size="sm"
                className="border-sage text-sage hover:bg-sage/10"
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* PDF Document */}
          <div className="flex justify-center overflow-auto bg-gray-100 rounded-lg p-4" style={{ maxHeight: '70vh' }}>
            <Document
              file={libroPdf}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="flex items-center justify-center h-96">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto mb-4"></div>
                    <p className="text-gray-500">Caricamento PDF...</p>
                  </div>
                </div>
              }
              error={
                <div className="flex items-center justify-center h-96">
                  <p className="text-red-500">Errore nel caricamento del PDF</p>
                </div>
              }
            >
              <Page
                pageNumber={pageNumber}
                scale={scale}
                className="shadow-lg"
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </Document>
          </div>
        </div>
      </div>
    </div>
  );
}

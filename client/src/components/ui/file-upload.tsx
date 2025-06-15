import React, { useState, useRef } from 'react';
import { Upload, X, Image as ImageIcon, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { compressImages } from '@/lib/imageCompression';
import ImageCompressionInfo from '@/components/ImageCompressionInfo';
import { extractChaptersFromFolders } from '@/lib/folderChapterMapper';
import { Chapter, PhotoWithChapter } from '@/components/ChaptersManager';
// Importa il nuovo lettore di cartelle semplificato
import { processFilesFromFolders } from '@/lib/simpleFolderReader';

// Esportiamo l'interfaccia PhotoWithChapter per compatibilità
export type { PhotoWithChapter } from '@/components/ChaptersManager';

interface FileUploadProps {
  onFilesSelected: (files: File[] | PhotoWithChapter[]) => void;
  multiple?: boolean;
  maxFiles?: number;
  accept?: string;
  className?: string;
  currentFiles?: File[];
  previews?: string[];
  onRemoveFile?: (index: number) => void;
  enableCompression?: boolean;
  compressionOptions?: {
    maxSizeMB?: number;
    maxWidthOrHeight?: number;
  };
  enableFolderUpload?: boolean;
  onChaptersExtracted?: (result: { 
    chapters: any[]; 
    photosWithChapters: any[];
  }) => void;
}

export default function FileUpload({
  onFilesSelected,
  multiple = false,
  maxFiles = 10,
  accept = 'image/*',
  className,
  currentFiles = [],
  previews = [],
  onRemoveFile,
  enableCompression = true,
  compressionOptions = { maxSizeMB: 1, maxWidthOrHeight: 1920 },
  enableFolderUpload = false,
  onChaptersExtracted
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [compressingFiles, setCompressingFiles] = useState<string[]>([]);
  const [compressionData, setCompressionData] = useState<{[filename: string]: {
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }}>({});
  // Stati per il caricamento delle cartelle
  const [isProcessingFolders, setIsProcessingFolders] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [totalFilesFound, setTotalFilesFound] = useState(0);
  const [processedFiles, setProcessedFiles] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);

  // Gestisce l'evento di drag over
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  // Gestisce l'evento di drag leave
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  // Processa i file con gestione ottimizzata della memoria
  const processFiles = async (files: File[]) => {
    try {
      // Per evitare problemi di memoria con molti file, processiamo in batch
      const BATCH_SIZE = 20; // Numero di file da processare in ogni batch
      const totalBatches = Math.ceil(files.length / BATCH_SIZE);
      
      
      
      if (enableCompression) {
        // Array per memorizzare tutti i file compressi
        const allCompressedFiles: File[] = [];
        
        // Processa i file in batch
        for (let i = 0; i < files.length; i += BATCH_SIZE) {
          const batchFiles = files.slice(i, i + BATCH_SIZE);
          const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
          
          
          
          // Imposta lo stato di compressione per questo batch
          const batchFileNames = batchFiles.map(file => file.name);
          setCompressingFiles(prev => [...prev, ...batchFileNames]);
          
          // Comprimi i file di questo batch
          const batchCompressedFiles = await Promise.all(batchFiles.map(async (file) => {
            if (file.type.startsWith('image/')) {
              try {
                // Usa il metodo di compressione singolo
                const compressedFile = await import('@/lib/imageCompression').then(
                  module => module.compressImage(file, compressionOptions)
                );
                
                // Memorizza le informazioni sulla compressione
                setCompressionData(prev => ({
                  ...prev,
                  [file.name]: {
                    originalSize: file.size,
                    compressedSize: compressedFile.size,
                    compressionRatio: file.size / compressedFile.size
                  }
                }));
                
                return compressedFile;
              } catch (error) {
                
                return file;
              }
            } else {
              return file;
            }
          }));
          
          // Aggiungi i file compressi all'array complessivo
          allCompressedFiles.push(...batchCompressedFiles);
          
          // Rimuovi lo stato di compressione per questo batch
          setCompressingFiles(prev => prev.filter(name => !batchFileNames.includes(name)));
          
          // Piccola pausa tra i batch per aiutare il garbage collector
          if (batchNumber < totalBatches) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        
        onFilesSelected(allCompressedFiles);
      } else {
        // Se la compressione non è abilitata, passa i file originali
        onFilesSelected(files);
      }
    } catch (error) {
      
      // Rimuovi lo stato di compressione in caso di errore
      setCompressingFiles([]);
      // Fallback ai file originali in caso di errore
      onFilesSelected(files);
    }
  };

  // Gestisce l'evento di drop
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    try {
      
      
      // Controlla se abbiamo file o elementi di directory
      if (!e.dataTransfer.items && (!e.dataTransfer.files || e.dataTransfer.files.length === 0)) {
        
        return;
      }
      
      // Controlla se multiple è abilitato
      if (!multiple && e.dataTransfer.files.length > 1) {
        alert('Puoi caricare solo un file.');
        return;
      }
      
      // Verifica se sono state rilasciate cartelle
      let hasDirectories = false;
      const dirNames: string[] = [];
      
      if (e.dataTransfer.items) {
        for (let i = 0; i < e.dataTransfer.items.length; i++) {
          const item = e.dataTransfer.items[i];
          const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
          
          if (entry?.isDirectory) {
            hasDirectories = true;
            dirNames.push(entry.name);
            
          }
        }
      }
      
      
      if (dirNames.length > 0) {
        
      }
      
      // Se abbiamo cartelle e il supporto è abilitato, usa l'implementazione semplificata
      if (enableFolderUpload && hasDirectories && onChaptersExtracted && e.dataTransfer.items) {
        
        
        // Mostra l'indicatore di progresso
        setIsProcessingFolders(true);
        setProcessingProgress(0);
        setProcessingStatus('Inizializzazione elaborazione cartelle...');
        setTotalFilesFound(0);
        setProcessedFiles(0);
        
        try {
          // Callback per aggiornare il progresso
          const updateProgress = (progress: number, status: string, filesFound?: number, filesProcessed?: number) => {
            setProcessingProgress(progress);
            setProcessingStatus(status);
            if (filesFound !== undefined) setTotalFilesFound(filesFound);
            if (filesProcessed !== undefined) setProcessedFiles(filesProcessed);
          };
          
          // Utilizziamo il nuovo metodo semplificato per processare le cartelle
          
          const result = await processFilesFromFolders(Array.from(e.dataTransfer.items), updateProgress);
          
          
          // Se abbiamo trovato file e capitoli
          if (result.files.length > 0 && result.chapters.length > 0) {
            
            
            // Notifica i capitoli estratti attraverso il callback
            onChaptersExtracted({
              chapters: result.chapters,
              photosWithChapters: result.photosWithChapters
            });
            
            // Aggiorna lo stato
            updateProgress(85, 'Compressione e caricamento foto...', result.files.length, result.files.length);
            
            // Procedi con la compressione e l'upload di tutti i file
            await processFiles(result.files);
            
            // Operazione completata
            updateProgress(100, 'Elaborazione cartelle completata!', result.files.length, result.files.length);
            setTimeout(() => setIsProcessingFolders(false), 1000); // Nascondi il loader dopo 1 secondo
            return;
          } else {
            
            updateProgress(50, 'Nessuna struttura di cartelle trovata, passaggio alla creazione manuale...', 0, 0);
          }
        } catch (error: any) {
          
          setProcessingStatus(`Errore: ${error.message || 'Errore sconosciuto'}`);
          // Mostra l'errore per alcuni secondi prima di passare al fallback
          setTimeout(() => {
            // Continua con l'approccio di fallback
            setIsProcessingFolders(false);
          }, 2000);
          return;
        }
      }
      
      // Se il metodo avanzato fallisce o non è disponibile, utilizza un approccio di fallback
      const newFiles = Array.from(e.dataTransfer.files);
      
      
      // Fallback: se abbiamo cartelle, creiamo manualmente i capitoli
      if (enableFolderUpload && dirNames.length > 0 && onChaptersExtracted) {
        
        
        // Creare capitoli basati sui nomi delle cartelle
        const manualChapters: Chapter[] = dirNames.map((dirName, idx) => ({
          id: `chapter-${Date.now()}-${idx}`,
          title: dirName,
          description: `Foto dalla cartella "${dirName}"`,
          position: idx
        }));
        
        // Distribuisci equamente i file tra i capitoli (fallback semplice)
        const filesPerChapter = Math.ceil(newFiles.length / dirNames.length);
        const manualPhotosWithChapters: PhotoWithChapter[] = [];
        
        newFiles.forEach((file, idx) => {
          const chapterIdx = Math.min(Math.floor(idx / filesPerChapter), dirNames.length - 1);
          manualPhotosWithChapters.push({
            id: `photo-${Date.now()}-${idx}`,
            file,
            url: URL.createObjectURL(file),
            name: file.name,
            chapterId: manualChapters[chapterIdx].id,
            position: idx
          });
        });
        
        // Usa i capitoli creati manualmente
        const manualResult = {
          chapters: manualChapters,
          photosWithChapters: manualPhotosWithChapters
        };
        
        
        onChaptersExtracted(manualResult);
        
        // Procedi con la compressione e l'upload
        await processFiles(newFiles);
        return;
      }
      
      // Fallback senza capitoli: processo standard
      
      await processFiles(newFiles);
    } catch (error: any) {
      
      alert(`Si è verificato un errore durante l'elaborazione dei file: ${error.message || 'Errore sconosciuto'}`);
    }
  };

  // Gestisce la selezione dei file tramite il file input
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      try {
        
        const newFiles = Array.from(e.target.files);
        
        
        // Controlla se abbiamo un input di tipo directory
        const webkitFilesWithPaths = newFiles.filter(file => 
          'webkitRelativePath' in file && (file as any).webkitRelativePath
        );
        
        const hasWebkitRelativePaths = webkitFilesWithPaths.length > 0;
        
        
        // Se abbiamo percorsi relativi e il supporto per cartelle è abilitato
        if (enableFolderUpload && hasWebkitRelativePaths && onChaptersExtracted) {
          // Mostra l'indicatore di progresso
          setIsProcessingFolders(true);
          setProcessingProgress(0);
          setProcessingStatus('Inizializzazione elaborazione cartelle...');
          setTotalFilesFound(0);
          setProcessedFiles(0);
          
          // Callback per aggiornare il progresso
          const updateProgress = (progress: number, status: string, filesFound?: number, filesProcessed?: number) => {
            setProcessingProgress(progress);
            setProcessingStatus(status);
            if (filesFound !== undefined) setTotalFilesFound(filesFound);
            if (filesProcessed !== undefined) setProcessedFiles(filesProcessed);
          };
          
          try {
            // Genera automaticamente i capitoli dai file con percorsi relativi
            updateProgress(5, 'Analisi delle cartelle...', newFiles.length, 0);
            
            // Crea una mappa di cartelle in base ai percorsi relativi dei file
            const chapters: Chapter[] = [];
            const photosWithChapters: PhotoWithChapter[] = [];
            const folderMap = new Map<string, File[]>();
            let processedFiles = 0;
            
            // Primo passaggio: raggruppa i file per cartella
            for (const file of webkitFilesWithPaths) {
              // Ottieni il percorso relativo
              const path = (file as any).webkitRelativePath || '';
              if (path && path.includes('/')) {
                // Estrai il nome della cartella principale
                const folderName = path.split('/')[0];
                
                // Aggiungi file al gruppo della cartella
                if (!folderMap.has(folderName)) {
                  folderMap.set(folderName, [file]);
                } else {
                  folderMap.get(folderName)!.push(file);
                }
              }
              
              processedFiles++;
              if (processedFiles % 100 === 0) {
                updateProgress(20, `Analisi file ${processedFiles}/${newFiles.length}...`, newFiles.length, processedFiles);
              }
            }
            
            // Secondo passaggio: crea capitoli per ogni cartella
            updateProgress(40, 'Creazione capitoli...', newFiles.length, processedFiles);
            let chapterIndex = 0;
            
            // Utilizzo Array.from per compatibilità con TypeScript
            const folderEntries = Array.from(folderMap.entries());
            for (let i = 0; i < folderEntries.length; i++) {
              const [folderName, files] = folderEntries[i];
              const chapterId = `chapter-${Date.now()}-${chapterIndex}`;
              
              // Crea il capitolo
              chapters.push({
                id: chapterId,
                title: folderName,
                description: `Foto dalla cartella "${folderName}"`,
                position: chapterIndex
              });
              
              chapterIndex++;
              
              // Crea le anteprime per ogni file nel capitolo
              for (let j = 0; j < files.length; j++) {
                const file = files[j];
                photosWithChapters.push({
                  id: `photo-${Date.now()}-${chapterIndex}-${j}`,
                  file,
                  url: URL.createObjectURL(file),
                  name: file.name,
                  chapterId: chapterId,
                  position: j,
                  folderPath: (file as any).webkitRelativePath
                });
              }
            }
            
            // Invia i capitoli e le foto con capitoli
            updateProgress(70, 'Capitoli creati, preparazione foto...', newFiles.length, newFiles.length);
            
            if (onChaptersExtracted) {
              onChaptersExtracted({
                chapters,
                photosWithChapters
              });
            }
            
            // Procedi con il processamento standard
            await processFiles(newFiles);
            
            // Nascondi l'indicatore di progresso
            updateProgress(100, 'Elaborazione completata!', newFiles.length, newFiles.length);
            setTimeout(() => setIsProcessingFolders(false), 1000);
            
          } catch (error: any) {
            
            setProcessingStatus(`Errore: ${error.message || 'Errore sconosciuto'}`);
            // Continua con il metodo standard
            setTimeout(() => {
              setIsProcessingFolders(false);
              // Procedi con il processamento standard
              processFiles(newFiles);
            }, 2000);
          }
        } else {
          // Processo standard per file senza percorsi
          await processFiles(newFiles);
        }
        
        // Reset del campo input per consentire il ricaricamento dello stesso file
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        
      }
    }
  };

  // Simula il click sull'input file quando si clicca sull'area di drop
  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Area di drop */}
      <div
        ref={dropAreaRef}
        className={cn(
          "border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer text-center",
          isDragging 
            ? "border-primary bg-primary/5" 
            : isProcessingFolders
              ? "border-blue-500 bg-blue-50"
              : "border-muted-foreground/25 hover:border-primary/50",
          "flex flex-col items-center justify-center gap-2",
          isProcessingFolders ? "pointer-events-none" : ""
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        {isProcessingFolders ? (
          <div className="w-full text-center">
            <div className="animate-pulse mb-3">
              <Folder className="h-10 w-10 text-blue-500 mx-auto animate-bounce" />
            </div>
            <h3 className="text-lg font-semibold text-blue-700 mb-2">{processingStatus}</h3>
            
            {/* Barra di progresso */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-3">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out"
                style={{ width: `${processingProgress}%` }}
              ></div>
            </div>
            
            {/* Informazioni sul progresso */}
            <div className="text-sm text-gray-600 flex justify-between items-center">
              <span>{processedFiles} di {totalFilesFound} file</span>
              <span>{processingProgress}%</span>
            </div>
            
            <p className="text-xs text-gray-500 mt-3">
              L'elaborazione di molte foto può richiedere tempo. Non chiudere questa finestra.
            </p>
          </div>
        ) : (
          <>
            {enableFolderUpload ? <Folder className="h-10 w-10 text-muted-foreground" /> : <Upload className="h-10 w-10 text-muted-foreground" />}
            <p className="text-sm font-medium">
              {enableFolderUpload ? (
                <>Trascina le cartelle qui o <span className="text-primary">selezionane dal computer</span></>
              ) : (
                <>Trascina le foto qui o <span className="text-primary">selezionane dal computer</span></>
              )}
            </p>
            <div className="text-xs text-muted-foreground space-y-1">
              {enableFolderUpload ? (
                <p className="font-medium text-green-600">
                  Carica intere cartelle per creare automaticamente i capitoli
                </p>
              ) : (
                <p>
                  {multiple 
                    ? "Carica quante immagini desideri" 
                    : "Puoi caricare una sola immagine"}
                </p>
              )}
              <p className="text-xs">
                Formato consigliato: max 2000px di lato lungo, max 5MB, 72-300 DPI
              </p>
              <p className="text-xs">
                Immagini più grandi saranno compresse automaticamente
              </p>
              {enableFolderUpload && (
                <p className="text-xs font-medium text-blue-500">
                  I nomi delle cartelle ("Sposo", "Sposa", "Cerimonia", ecc.) verranno usati come capitoli
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Input file nascosto */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        multiple={multiple}
        accept={accept}
        className="hidden"
        {...(enableFolderUpload ? { webkitdirectory: "", directory: "" } : {})}
      />

      {/* Informazioni sulla compressione e anteprima */}
      {!isProcessingFolders && (
        <>
          {/* File in compressione */}
          {compressingFiles.length > 0 && (
            <div className="mt-4 mb-4">
              <p className="text-sm font-medium mb-2">Compressione in corso...</p>
              <div className="space-y-2">
                {compressingFiles.map((fileName, index) => (
                  <div key={`compressing-${fileName}-${index}`} className="flex items-center text-sm">
                    <div className="animate-spin mr-2">
                      <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                    <span className="truncate">{fileName}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Riepilogo file selezionati */}
          {(currentFiles.length > 0 || previews.length > 0) && (
            <div className="mt-4 bg-muted/50 p-4 rounded-lg border">
              <div className="flex flex-wrap items-center justify-between mb-3">
                <h3 className="font-medium text-sm">
                  {currentFiles.length + previews.length} file selezionati
                </h3>
                {currentFiles.length > 12 && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando 12 di {currentFiles.length} file
                  </p>
                )}
              </div>
              
              {/* Statistiche sui file */}
              {currentFiles.length > 0 && (
                <div className="text-xs text-muted-foreground mb-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <span className="font-medium">Tipo immagine:</span> {Object.entries(
                      currentFiles.reduce((acc, file) => {
                        const type = file.type.split('/')[1] || 'altro';
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([type, count]) => `${type} (${count})`).join(', ')}
                  </div>
                  <div>
                    <span className="font-medium">Dimensione totale:</span> {
                      (currentFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024)).toFixed(2)
                    } MB
                  </div>
                  <div>
                    <span className="font-medium">Media dimensione:</span> {
                      (currentFiles.reduce((acc, file) => acc + file.size, 0) / (1024 * 1024 * currentFiles.length)).toFixed(2)
                    } MB
                  </div>
                </div>
              )}
              
              {/* Anteprime dei file (max 12) */}
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {currentFiles.slice(0, 12).map((file, index) => (
                  <div key={`file-upload-${file.name}-${index}`} className="relative group">
                    <div className="relative aspect-square rounded-md overflow-hidden border bg-background">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`Preview ${index}`}
                        className="object-cover w-full h-full"
                      />
                      {onRemoveFile && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Rimuovi anche i dati di compressione
                            setCompressionData(prev => {
                              const newData = {...prev};
                              delete newData[file.name];
                              return newData;
                            });
                            onRemoveFile(index);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                
                {previews.slice(0, Math.max(0, 12 - currentFiles.length)).map((preview, index) => (
                  <div key={`preview-${index}`} className="relative group">
                    <div className="relative aspect-square rounded-md overflow-hidden border bg-background">
                      <img
                        src={preview}
                        alt={`Existing preview ${index}`}
                        className="object-cover w-full h-full"
                      />
                      {onRemoveFile && (
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 h-5 w-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveFile(index + currentFiles.length);
                          }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Messaggio per file non mostrati */}
              {(currentFiles.length + previews.length > 12) && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {currentFiles.length + previews.length - 12} file aggiuntivi non mostrati
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
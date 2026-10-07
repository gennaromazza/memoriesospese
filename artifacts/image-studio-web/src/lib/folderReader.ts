/**
 * Utility per la lettura ricorsiva delle cartelle e l'estrazione dei file
 * Funziona con l'API FileSystem del browser
 */

import { Chapter, PhotoWithChapter } from '@/components/ChaptersManager';

/**
 * Legge ricorsivamente tutti i file dalle cartelle utilizzando l'API FileSystem
 * @param entries - Array di FileSystemEntry da elaborare
 * @returns Promise con array di file e mappa della struttura delle cartelle
 */
export async function getAllFilesFromEntries(entries: any[]): Promise<{
  files: File[];
  folderMap: Map<string, { files: File[]; folderName: string }>;
}> {
  const files: File[] = [];
  const folderPromises: Promise<File[]>[] = [];
  
  // Mappa per tenere traccia della struttura delle cartelle
  const folderMap = new Map<string, { files: File[]; folderName: string }>();
  
  // Funzione ricorsiva per leggere una cartella
  const readDirectory = (entry: any, parentPath: string = ''): Promise<File[]> => {
    return new Promise((resolve) => {
      const dirReader = entry.createReader();
      const folderFiles: File[] = [];
      
      // Questa funzione legge batch di entries da una cartella
      const readEntries = () => {
        dirReader.readEntries(async (entries: any[]) => {
          if (entries.length === 0) {
            // Non ci sono più entries nella cartella, risolvi la promessa
            resolve(folderFiles);
          } else {
            // Processa ogni entry nel batch corrente
            const entryPromises = entries.map(async (entry) => {
              const fullPath = parentPath ? `${parentPath}/${entry.name}` : entry.name;
              
              if (entry.isDirectory) {
                // Se è una cartella, leggi il suo contenuto ricorsivamente
                const nestedFiles = await readDirectory(entry, fullPath);
                folderFiles.push(...nestedFiles);
              } else if (entry.isFile) {
                // Se è un file, aggiungilo all'array
                return new Promise<void>((resolveFile) => {
                  entry.file((file: File) => {
                    // Aggiungi informazioni sulla cartella al file
                    const enhancedFile = Object.defineProperty(file, 'fullPath', {
                      value: fullPath,
                      writable: false
                    });
                    
                    // Estrai il nome della cartella dal percorso
                    const pathParts = fullPath.split('/');
                    if (pathParts.length > 1) {
                      const folderName = pathParts[0]; // Nome della cartella principale
                      
                      // Aggiungi il file alla struttura della cartella
                      if (!folderMap.has(folderName)) {
                        folderMap.set(folderName, { 
                          files: [enhancedFile],
                          folderName
                        });
                      } else {
                        folderMap.get(folderName)!.files.push(enhancedFile);
                      }
                    }
                    
                    folderFiles.push(enhancedFile);
                    resolveFile();
                  }, (error: any) => {
                    
                    resolveFile();
                  });
                });
              }
            });
            
            // Attendi che tutte le entries di questo batch siano processate
            await Promise.all(entryPromises);
            
            // Continua a leggere il prossimo batch
            readEntries();
          }
        }, (error: any) => {
          
          resolve(folderFiles);
        });
      };
      
      // Inizia a leggere la cartella
      readEntries();
    });
  };
  
  // Per ogni entry iniziale, determina se è un file o una cartella
  for (const entry of entries) {
    if (entry.isDirectory) {
      // Se è una cartella, leggi il suo contenuto in modo asincrono
      folderPromises.push(readDirectory(entry));
    } else if (entry.isFile) {
      // Se è un file, aggiungilo direttamente
      const promise = new Promise<File>((resolve) => {
        entry.file((file: File) => {
          files.push(file);
          resolve(file);
        }, (error: any) => {
          
          resolve(null as any);
        });
      });
      folderPromises.push(promise.then(file => [file].filter(Boolean)));
    }
  }
  
  // Attendi che tutte le cartelle siano lette
  const allFolderFiles = await Promise.all(folderPromises);
  
  // Appiattisci l'array di array
  const allFiles = files.concat(...allFolderFiles);
  
  
  
  
  return {
    files: allFiles,
    folderMap
  };
}

/**
 * Processa gli elementi DataTransferItem per estrarre file e cartelle
 * @param items - Array di DataTransferItem da processare
 * @returns Promise con array di file e mappa della struttura delle cartelle
 */
export async function processItemsWithFolders(
  items: DataTransferItem[],
  progressCallback?: (progress: number, status: string, filesFound?: number, filesProcessed?: number) => void
): Promise<{
  files: File[];
  folderMap: Map<string, {files: File[]; folderName: string}>;
}> {
  // Converti DataTransferItems in entry di FileSystem
  const entries = [];
  const folderNames = new Set<string>();
  
  // Per logging
  let totalFiles = 0;
  let totalFolders = 0;
  
  // Notifica l'inizio del processo
  if (progressCallback) {
    progressCallback(10, 'Analisi delle cartelle...', 0, 0);
  }
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (entry) {
        entries.push(entry);
        if (entry.isDirectory) {
          folderNames.add(entry.name);
          totalFolders++;
        } else {
          totalFiles++;
        }
      }
    }
  }
  
  
  
  
  // Aggiorna il progresso
  if (progressCallback) {
    progressCallback(20, `Trovate ${totalFolders} cartelle, inizio scansione...`, totalFiles, 0);
  }
  
  // Wrapper per getAllFilesFromEntries che aggiorna il progresso
  const getFilesWithProgress = async (entries: any[]) => {
    let processedFiles = 0;
    let lastProgressUpdate = Date.now();
    
    // Interval per aggiornare il progresso anche se il valore non cambia
    const progressInterval = setInterval(() => {
      if (progressCallback && Date.now() - lastProgressUpdate > 1000) {
        progressCallback(
          20 + Math.min(50, (processedFiles / Math.max(totalFiles, 1)) * 30),
          `Elaborazione cartelle in corso (${processedFiles}/${totalFiles || '?'} file)...`,
          totalFiles,
          processedFiles
        );
      }
    }, 500);
    
    // Ottieni i file con un conteggio personalizzato
    const result = await getAllFilesFromEntries(entries);
    
    // Aggiorna il conteggio finale e pulisci l'intervallo
    clearInterval(progressInterval);
    processedFiles = result.files.length;
    
    if (progressCallback) {
      progressCallback(
        45, 
        `Trovati ${result.files.length} file in ${result.folderMap.size} cartelle`,
        result.files.length,
        result.files.length
      );
    }
    
    return result;
  };
  
  // Elabora tutte le entry (file e cartelle) con aggiornamenti di progresso
  return await getFilesWithProgress(entries);
}

/**
 * Crea capitoli e assegna foto in base alla struttura delle cartelle
 * @param files - Array di file da processare
 * @param folderMap - Mappa con la struttura delle cartelle
 * @returns Oggetto con capitoli e foto assegnate
 */
export function createChaptersFromFolderStructure(
  files: File[],
  folderMap: Map<string, {files: File[]; folderName: string}>,
  progressCallback?: (progress: number, status: string, filesFound?: number, filesProcessed?: number) => void
): { chapters: Chapter[]; photosWithChapters: PhotoWithChapter[] } {
  // Aggiorna il progresso
  if (progressCallback) {
    progressCallback(50, 'Creazione dei capitoli dalle cartelle...', files.length, 0);
  }

  // Crea un capitolo per ogni cartella
  const chapters: Chapter[] = Array.from(folderMap.entries()).map(([folderName, data], idx) => ({
    id: `chapter-${Date.now()}-${idx}`,
    title: folderName,
    description: `Foto dalla cartella "${folderName}"`,
    position: idx
  }));
  
  // Mappa per trovare rapidamente il capitolo per nome cartella
  const folderToChapter = new Map<string, Chapter>();
  chapters.forEach(chapter => folderToChapter.set(chapter.title, chapter));
  
  // Crea "Altre foto" per i file che non appartengono a nessuna cartella
  const defaultChapter: Chapter = {
    id: `chapter-${Date.now()}-default`,
    title: "Altre foto",
    description: "Foto senza cartella specifica",
    position: chapters.length
  };
  
  // Aggiungi il capitolo predefinito solo se necessario
  let usedDefaultChapter = false;
  
  // Crea l'array di foto con capitoli
  const photosWithChapters: PhotoWithChapter[] = [];
  let position = 0;
  
  // Aggiorna il progresso
  if (progressCallback) {
    progressCallback(55, `Trovati ${chapters.length} capitoli, assegnazione foto...`, files.length, 0);
  }
  
  // Primo passaggio: assegna le foto che hanno una cartella definita
  // Uso Array.from per evitare errori con l'iterator di Map
  Array.from(folderMap.entries()).forEach(([folderName, data]) => {
    const chapter = folderToChapter.get(folderName);
    
    if (chapter) {
      for (let i = 0; i < data.files.length; i++) {
        const file = data.files[i];
        photosWithChapters.push({
          id: `photo-${Date.now()}-${position}`,
          file,
          url: URL.createObjectURL(file),
          name: file.name,
          chapterId: chapter.id,
          position: position++
        });
      }
    }
  });
  
  // Secondo passaggio: assegna le foto senza cartella al capitolo predefinito
  const processedFiles = new Set(photosWithChapters.map(p => p.file));
  
  for (const file of files) {
    if (!processedFiles.has(file)) {
      if (!usedDefaultChapter) {
        usedDefaultChapter = true;
        chapters.push(defaultChapter);
      }
      
      photosWithChapters.push({
        id: `photo-${Date.now()}-${position}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        chapterId: defaultChapter.id,
        position: position++
      });
    }
  }
  
  // Calcola statistiche per il debug
  const chaptersCount = new Map<string, number>();
  photosWithChapters.forEach(photo => {
    const chapterId = photo.chapterId || 'undefined';
    chaptersCount.set(chapterId, (chaptersCount.get(chapterId) || 0) + 1);
  });
  
  
  // Uso Array.from per evitare errori con l'iterator di Map
  Array.from(chaptersCount.entries()).forEach(([chapterId, count]) => {
    const chapterTitle = chapters.find(c => c.id === chapterId)?.title || 'Sconosciuto';
    
  });
  
  
  
  // Aggiorna il progresso
  if (progressCallback) {
    progressCallback(
      65, 
      `Completata organizzazione di ${photosWithChapters.length} foto in ${chapters.length} capitoli`,
      files.length,
      photosWithChapters.length
    );
  }
  
  return {
    chapters,
    photosWithChapters
  };
}
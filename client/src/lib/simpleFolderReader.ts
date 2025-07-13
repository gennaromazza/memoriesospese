/**
 * Versione semplificata per la lettura dei file dalle cartelle
 * con assegnazione diretta ai capitoli
 */

import { Chapter, PhotoWithChapter } from '@/components/ChaptersManager';

// FileSystem API types
interface FileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath: string;
}

interface FileSystemFileEntry extends FileSystemEntry {
  isFile: true;
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  isDirectory: true;
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ): void;
}

/**
 * Utilizza metodo semplificato per leggere file dalle DataTransferItems
 * e assegnarli alle cartelle corrette
 */
export async function processFilesFromFolders(
  items: DataTransferItem[],
  progressCallback?: (progress: number, status: string, filesFound?: number, filesProcessed?: number) => void
): Promise<{
  files: File[];
  chapters: Chapter[];
  photosWithChapters: PhotoWithChapter[];
}> {
  // Callback di progresso
  const updateProgress = (progress: number, status: string, filesFound?: number, filesProcessed?: number) => {
    if (progressCallback) {
      progressCallback(progress, status, filesFound, filesProcessed);
    }
  };
  
  updateProgress(5, 'Analisi delle cartelle...', 0, 0);
  
  // Per prima cosa, analizziamo le cartelle e creiamo una mappa
  const folderEntries: { entry: FileSystemDirectoryEntry, name: string }[] = [];
  const fileEntries: { entry: FileSystemFileEntry, folderName: string | null }[] = [];
  
  // Identifica tutte le entry di cartelle e file
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
      if (entry) {
        if (entry.isDirectory) {
          folderEntries.push({ entry: entry as FileSystemDirectoryEntry, name: entry.name });
          
        } else if (entry.isFile) {
          // I file nella radice non hanno una cartella
          fileEntries.push({ entry: entry as FileSystemFileEntry, folderName: null });
        }
      }
    }
  }
  
  updateProgress(10, `Trovate ${folderEntries.length} cartelle`, 0, 0);
  
  // Crea i capitoli in base alle cartelle trovate
  // Creiamo una mappa per tener traccia degli ID dei capitoli per ogni nome di cartella
  const folderNameToChapterId: Map<string, string> = new Map();
  
  const chapters: Chapter[] = folderEntries.map((folder, idx) => {
    const chapterId = `chapter-${Date.now()}-${idx}`;
    folderNameToChapterId.set(folder.name, chapterId);
    
    return {
      id: chapterId,
      title: folder.name,
      description: `Foto dalla cartella "${folder.name}"`,
      position: idx
    };
  });
  
  // Aggiungi un capitolo "Altre foto" se abbiamo file nella radice
  const defaultChapterId = `chapter-${Date.now()}-default`;
  const defaultChapter: Chapter = {
    id: defaultChapterId,
    title: "Altre foto",
    description: "Foto senza cartella specifica",
    position: chapters.length
  };
  
  updateProgress(20, `Creati ${chapters.length} capitoli, lettura file...`, 0, 0);
  
  // Ora leggiamo i file da ogni cartella
  // Funzione per leggere tutti i file da una cartella
  const readFilesFromDirectory = async (directoryEntry: FileSystemDirectoryEntry, folderName: string) => {
    const files: File[] = [];
    let filesToProcess = 0;
    let filesProcessed = 0;
    
    // Funzione ricorsiva per leggere una cartella e le sue sottocartelle
    const readDirectory = async (entry: FileSystemEntry): Promise<void> => {
      return new Promise((resolve) => {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        
        // Legge i batch di entries
        const readNextBatch = () => {
          reader.readEntries(async (entries: FileSystemEntry[]) => {
            if (entries.length === 0) {
              // Cartella completamente letta
              resolve();
              return;
            }
            
            // Processiamo tutte le entry in questo batch
            const promises = entries.map(async (entry) => {
              if (entry.isDirectory) {
                // Processa ricorsivamente le sottocartelle
                await readDirectory(entry);
              } else if (entry.isFile) {
                // Aggiungiamo al conteggio totale
                filesToProcess++;
                
                // Leggi il file
                return new Promise<void>((resolveFile) => {
                  (entry as FileSystemFileEntry).file((file: File) => {
                    files.push(file);
                    filesProcessed++;
                    
                    // Aggiorna il progresso
                    if (progressCallback && filesProcessed % 10 === 0) {
                      updateProgress(
                        20 + Math.min(30, (filesProcessed / Math.max(filesToProcess, 1)) * 30),
                        `Lettura file dalla cartella "${folderName}" (${filesProcessed}/${filesToProcess})...`,
                        filesToProcess,
                        filesProcessed
                      );
                    }
                    
                    resolveFile();
                  }, () => {
                    filesProcessed++;
                    resolveFile();
                  });
                });
              }
            });
            
            // Attendi che tutte le entry di questo batch siano processate
            await Promise.all(promises);
            
            // Continua con il prossimo batch
            readNextBatch();
          });
        };
        
        // Inizia a leggere
        readNextBatch();
      });
    };
    
    // Inizia la lettura ricorsiva
    await readDirectory(directoryEntry);
    return files;
  };
  
  // Leggi tutti i file dalle cartelle
  const folderFiles: Map<string, File[]> = new Map();
  let allFiles: File[] = [];
  let totalProcessed = 0;
  
  // Per ogni cartella, leggi tutti i file
  for (let i = 0; i < folderEntries.length; i++) {
    const { entry, name } = folderEntries[i];
    updateProgress(20, `Lettura file dalla cartella "${name}"...`, 0, totalProcessed);
    
    try {
      const files = await readFilesFromDirectory(entry, name);
      
      
      // Salva i file per questa cartella
      folderFiles.set(name, files);
      allFiles = allFiles.concat(files);
      totalProcessed += files.length;
      
      updateProgress(
        50,
        `Completata lettura di ${totalProcessed} file da ${i + 1}/${folderEntries.length} cartelle...`,
        totalProcessed,
        totalProcessed
      );
    } catch (error) {
      
    }
  }
  
  // Leggi i file nella radice
  updateProgress(60, 'Elaborazione file nella radice...', totalProcessed, totalProcessed);
  const rootFiles: File[] = [];
  
  for (const { entry, folderName } of fileEntries) {
    if (!folderName) {
      // È un file nella radice
      try {
        await new Promise<void>((resolve) => {
          entry.file((file: File) => {
            rootFiles.push(file);
            allFiles.push(file);
            totalProcessed++;
            resolve();
          }, () => {
            resolve();
          });
        });
      } catch (error) {
        
      }
    }
  }
  
  // Crea PhotoWithChapter per tutti i file
  const photosWithChapters: PhotoWithChapter[] = [];
  let position = 0;
  
  updateProgress(70, 'Assegnazione file ai capitoli...', totalProcessed, 0);
  let assignedCount = 0;
  
  // Prima assegna i file delle cartelle ai rispettivi capitoli
  // Iterazione manuale attraverso la mappa
  const folderNames = Array.from(folderFiles.keys());
  
  // Crea un indice per tenere traccia della posizione iniziale di ogni capitolo
  const chapterPositions: Record<string, number> = {};
  let currentPosition = 0;
  
  // Prima assegniamo le posizioni iniziali per ogni capitolo
  folderNames.forEach((folderName, index) => {
    const chapterId = folderNameToChapterId.get(folderName);
    if (chapterId) {
      chapterPositions[chapterId] = currentPosition;
      const files = folderFiles.get(folderName) || [];
      currentPosition += files.length;
    }
  });
  
  
  
  // Ora assegniamo i file ai capitoli, mantenendo l'ordine corretto
  for (const folderName of folderNames) {
    const files = folderFiles.get(folderName) || [];
    const chapterId = folderNameToChapterId.get(folderName);
    
    if (chapterId) {
      
      
      // Partiamo dalla posizione iniziale per questo capitolo
      let chapterPosition = chapterPositions[chapterId];
      
      for (let j = 0; j < files.length; j++) {
        const file = files[j];
        
        // Generiamo un ID univoco basato su timestamp e posizione
        // Ma evitiamo di usare Date.now() per ogni file per evitare duplicati
        const uniqueTimestamp = Date.now() + j;
        const uniqueId = `photo-${uniqueTimestamp}-${chapterPosition}`;
        
        // Creiamo più metadati della foto per identificazione
        const filePathParts = file.webkitRelativePath?.split('/') || [];
        const filePathInfo = filePathParts.length > 1 
          ? { folderPath: filePathParts.slice(0, -1).join('/') } 
          : {};
        
        photosWithChapters.push({
          id: uniqueId,
          file,
          url: URL.createObjectURL(file),
          name: file.name,
          chapterId: chapterId,
          position: chapterPosition++,
          ...filePathInfo
        });
        
        assignedCount++;
        if (assignedCount % 20 === 0) {
          updateProgress(
            70 + Math.min(20, (assignedCount / Math.max(totalProcessed, 1)) * 20),
            `Assegnazione file ai capitoli (${assignedCount}/${totalProcessed})...`,
            totalProcessed,
            assignedCount
          );
        }
      }
      
      // Aggiorna la posizione per il prossimo capitolo
      chapterPositions[chapterId] = chapterPosition;
    }
  }
  
  // Raccogli file non assegnati (sia nella root che nelle cartelle senza corrispondenza)
  const unassignedFiles = [...rootFiles];
  
  // Cerca file in cartelle che non hanno trovato corrispondenza con capitoli
  for (const folderName of folderNames) {
    const chapterId = folderNameToChapterId.get(folderName);
    // Se non c'è un chapterId, questi file non sono stati assegnati
    if (!chapterId) {
      const filesInFolder = folderFiles.get(folderName) || [];
      if (filesInFolder.length > 0) {
        
        unassignedFiles.push(...filesInFolder);
      }
    }
  }
  
  // Se ci sono file non assegnati, creaiamo un capitolo predefinito
  if (unassignedFiles.length > 0) {
    
    
    // Aggiungi il capitolo predefinito solo se ci sono file da assegnare
    chapters.push(defaultChapter);
    
    // Assegna tutti i file non assegnati al capitolo predefinito
    for (let i = 0; i < unassignedFiles.length; i++) {
      const file = unassignedFiles[i];
      
      // Generiamo ID univoci per evitare sovrapposizioni
      const uniqueTimestamp = Date.now() + i;
      
      photosWithChapters.push({
        id: `photo-${uniqueTimestamp}-${position}`,
        file,
        url: URL.createObjectURL(file),
        name: file.name,
        chapterId: defaultChapterId,
        position: position++,
        folderPath: file.webkitRelativePath 
          ? file.webkitRelativePath.split('/').slice(0, -1).join('/') 
          : 'root'
      });
      
      assignedCount++;
      
      // Aggiorna il progresso ogni 20 file
      if (i % 20 === 0) {
        updateProgress(
          90 + Math.min(5, (i / Math.max(unassignedFiles.length, 1)) * 5),
          `Assegnazione file al capitolo predefinito (${i}/${unassignedFiles.length})...`,
          totalProcessed,
          assignedCount
        );
      }
    }
  }
  
  updateProgress(95, 'Completamento elaborazione...', totalProcessed, totalProcessed);
  
  // Statistiche dettagliate
  const chapterStats = new Map<string, number>();
  const totalChapters = chapters.length;
  const totalAssignedPhotos = photosWithChapters.length;
  
  
  
  
  
  
  
  if (totalChapters > 0) {
    
    chapters.forEach(chapter => {
      const count = photosWithChapters.filter(p => p.chapterId === chapter.id).length;
      chapterStats.set(chapter.id, count);
      const percentage = Math.round((count / totalAssignedPhotos) * 100);
      
    });
  }
  
  // Verifica se ci sono file che non sono stati assegnati a nessun capitolo (non dovrebbero esserci)
  const unassignedInFinal = photosWithChapters.filter(p => !p.chapterId).length;
  if (unassignedInFinal > 0) {
    
  }
  
  
  
  updateProgress(100, 'Elaborazione completata!', totalProcessed, totalProcessed);
  
  return {
    files: allFiles,
    chapters,
    photosWithChapters
  };
}
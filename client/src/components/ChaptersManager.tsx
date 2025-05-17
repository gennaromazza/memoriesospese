import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { Plus, Trash2, GripVertical, Edit, Check, X, MoveUp, MoveDown, Upload } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { cn } from '@/lib/utils';
import PhotoUploadToChapter from '@/components/gallery/PhotoUploadToChapter';

// Definisco le interfacce per i capitoli e le foto
export interface Chapter {
  id: string;
  title: string;
  description?: string;
  position: number;
}

export interface PhotoWithChapter {
  id: string;
  file: File;
  url: string;
  name: string;
  chapterId?: string; // ID del capitolo a cui appartiene la foto
  position: number; // Posizione all'interno del capitolo
  folderPath?: string; // Percorso della cartella (per migliore tracciabilità)
  contentType?: string; // Tipo di contenuto dell'immagine
  size?: number; // Dimensione del file in byte
  galleryId?: string; // ID della galleria a cui appartiene la foto
}

interface ChaptersManagerProps {
  photos: PhotoWithChapter[];
  onPhotosUpdate: (photos: PhotoWithChapter[]) => void;
  chapters: Chapter[];
  onChaptersUpdate: (chapters: Chapter[]) => void;
  onDeletePhoto?: (photo: PhotoWithChapter) => void;
}

export default function ChaptersManager({
  photos,
  onPhotosUpdate,
  chapters,
  onChaptersUpdate,
  onDeletePhoto = undefined
}: ChaptersManagerProps) {
  
  // Stato per la gestione del caricamento foto in un capitolo specifico
  const [uploadToChapter, setUploadToChapter] = useState<{
    isOpen: boolean;
    chapterId: string;
    chapterTitle: string;
    galleryId?: string;
  }>({
    isOpen: false,
    chapterId: '',
    chapterTitle: ''
  });
  
  // Cerca l'ID della galleria tra le foto
  const galleryId = photos.length > 0 ? photos.find(p => p.galleryId)?.galleryId || '' : '';
  
  // Funzione locale per gestire l'eliminazione di una foto
  const handleDeletePhoto = (photo: PhotoWithChapter) => {
    if (window.confirm(`Sei sicuro di voler eliminare questa foto (${photo.name})? Questa azione è irreversibile.`)) {
      if (onDeletePhoto) {
        onDeletePhoto(photo);
      }
    }
  };
  
  // Debug stato attuale dei capitoli e foto
  useEffect(() => {
    const unassignedPhotos = photos.filter(p => !p.chapterId);
    const photosPerChapter = new Map<string, number>();
    
    // Conteggio accurato per capitolo
    chapters.forEach(chapter => {
      const count = photos.filter(p => p.chapterId === chapter.id).length;
      photosPerChapter.set(chapter.id, count);
    });

    console.log("ChaptersManager - Stato attuale:");
    console.log(`- Totale foto: ${photos.length}`);
    console.log(`- Foto non assegnate: ${unassignedPhotos.length}`);
    console.log(`- Capitoli: ${chapters.length}`);
    console.log("Foto per capitolo:", Object.fromEntries(photosPerChapter));
    
    // Verifica incongruenze
    const totalAssigned = Array.from(photosPerChapter.values()).reduce((a, b) => a + b, 0);
    if (totalAssigned + unassignedPhotos.length !== photos.length) {
      console.warn("⚠️ Incongruenza nel conteggio delle foto!");
    }
  }, [photos, chapters]);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterDescription, setNewChapterDescription] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [bulkActionChapter, setBulkActionChapter] = useState<string | null>(null);
  
  // Quando cambiano i capitoli, aggiorna il tab attivo se necessario
  useEffect(() => {
    if (chapters.length === 0 && activeTab !== 'all') {
      setActiveTab('all');
    } else if (chapters.length > 0 && !chapters.some(c => c.id === activeTab) && activeTab !== 'all') {
      setActiveTab('all');
    }
  }, [chapters, activeTab]);
  
  // Genera un ID unico
  const generateId = () => `chapter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Aggiunge un nuovo capitolo
  const addChapter = () => {
    const newChapter: Chapter = {
      id: generateId(),
      title: `Capitolo ${chapters.length + 1}`,
      description: '',
      position: chapters.length
    };
    
    const updatedChapters = [...chapters, newChapter];
    onChaptersUpdate(updatedChapters);
    setActiveTab(newChapter.id);
    setEditingChapterId(newChapter.id);
    setNewChapterTitle(newChapter.title);
    setNewChapterDescription('');
  };
  
  // Rimuove un capitolo e le sue foto
  const removeChapter = (chapterId: string) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo capitolo? Le foto verranno spostate in "Non assegnate".')) {
      return;
    }
    
    // Rimuovi il capitolo
    const updatedChapters = chapters.filter(c => c.id !== chapterId);
    
    // Aggiorna le posizioni
    const reorderedChapters = updatedChapters.map((c, index) => ({
      ...c,
      position: index
    }));
    
    // Rimuovi l'assegnazione del capitolo dalle foto
    const updatedPhotos = photos.map(photo => 
      photo.chapterId === chapterId 
        ? { ...photo, chapterId: undefined } 
        : photo
    );
    
    onChaptersUpdate(reorderedChapters);
    onPhotosUpdate(updatedPhotos);
    
    // Se il tab attivo è il capitolo rimosso, passa a 'all'
    if (activeTab === chapterId) {
      setActiveTab('all');
    }
  };
  
  // Modifica il titolo di un capitolo
  const saveChapterEdit = (chapterId: string) => {
    const updatedChapters = chapters.map(chapter => 
      chapter.id === chapterId
        ? {
            ...chapter,
            title: newChapterTitle || `Capitolo ${chapter.position + 1}`,
            description: newChapterDescription
          }
        : chapter
    );
    
    onChaptersUpdate(updatedChapters);
    setEditingChapterId(null);
  };
  
  // Annulla la modifica
  const cancelChapterEdit = () => {
    setEditingChapterId(null);
  };
  
  // Avvia la modifica di un capitolo
  const startEditingChapter = (chapter: Chapter) => {
    setEditingChapterId(chapter.id);
    setNewChapterTitle(chapter.title);
    setNewChapterDescription(chapter.description || '');
  };
  
  // Sposta un capitolo su o giù
  const moveChapter = (chapterId: string, direction: 'up' | 'down') => {
    const chapterIndex = chapters.findIndex(c => c.id === chapterId);
    if (chapterIndex === -1) return;
    
    const newChapters = [...chapters];
    
    if (direction === 'up' && chapterIndex > 0) {
      // Scambia con il capitolo precedente
      const temp = { ...newChapters[chapterIndex] };
      newChapters[chapterIndex] = { ...newChapters[chapterIndex - 1], position: chapterIndex };
      newChapters[chapterIndex - 1] = { ...temp, position: chapterIndex - 1 };
    } else if (direction === 'down' && chapterIndex < newChapters.length - 1) {
      // Scambia con il capitolo successivo
      const temp = { ...newChapters[chapterIndex] };
      newChapters[chapterIndex] = { ...newChapters[chapterIndex + 1], position: chapterIndex };
      newChapters[chapterIndex + 1] = { ...temp, position: chapterIndex + 1 };
    }
    
    onChaptersUpdate(newChapters);
  };
  
  // Assegna una foto a un capitolo
  const assignPhotoToChapter = (photoId: string, chapterId: string | undefined) => {
    console.log(`Assegnando foto ${photoId} al capitolo ${chapterId || 'nessuno'}`);
    
    const photoToUpdate = photos.find(p => p.id === photoId);
    if (!photoToUpdate) {
      console.error(`Foto ${photoId} non trovata`);
      return;
    }

    console.log(`Foto trovata: ${photoToUpdate.name}, capitolo attuale: ${photoToUpdate.chapterId || 'nessuno'}`);
    
    const targetChapterPhotos = photos.filter(p => p.chapterId === chapterId);
    const newPosition = targetChapterPhotos.length;
    
    // Aggiungi un'animazione di feedback per mostrare che la foto è stata assegnata
    const photoElement = document.getElementById(`photo-${photoId}`);
    if (photoElement) {
      photoElement.classList.add('assignment-animation');
      setTimeout(() => {
        photoElement.classList.remove('assignment-animation');
      }, 800);
    }
    
    const updatedPhotos = photos.map(photo => 
      photo.id === photoId 
        ? { 
            ...photo, 
            chapterId,
            position: photo.position,
            chapterPosition: newPosition
          } 
        : photo
    );
    
    // Verifica che l'aggiornamento sia avvenuto correttamente
    const updatedPhoto = updatedPhotos.find(p => p.id === photoId);
    if (updatedPhoto) {
      console.log(`Dopo l'aggiornamento: ${updatedPhoto.name}, nuovo capitolo: ${updatedPhoto.chapterId || 'nessuno'}`);
      
      // Mostra un feedback visivo nella UI per l'assegnazione
      const chapterName = chapterId 
        ? chapters.find(c => c.id === chapterId)?.title || 'Capitolo sconosciuto'
        : 'Nessun capitolo';
        
      // Aggiorna il valore del capitolo nell'interfaccia
      const selectElement = document.getElementById(`chapter-select-${photoId}`) as HTMLSelectElement;
      if (selectElement) {
        selectElement.value = chapterId || '';
        // Aggiungi un'animazione di evidenziazione al select
        selectElement.classList.add('highlight-selection');
        setTimeout(() => {
          selectElement.classList.remove('highlight-selection');
        }, 1500);
      }
    }
    
    onPhotosUpdate(updatedPhotos);
    
    // Statistiche post-aggiornamento
    setTimeout(() => {
      const chapterStats: Record<string, number> = {};
      chapters.forEach(chapter => {
        chapterStats[chapter.title] = updatedPhotos.filter(p => p.chapterId === chapter.id).length;
      });
      console.log("Distribuzione foto per capitolo:", chapterStats);
    }, 50);
  };
  
  // Assegna più foto a un capitolo
  const assignMultiplePhotosToChapter = (photoIds: string[], chapterId: string | undefined) => {
    // Calcola le posizioni per ciascuna foto nel nuovo capitolo
    const currentPhotosInChapter = photos.filter(p => p.chapterId === chapterId).length;
    let position = currentPhotosInChapter;
    
    // Animazione di feedback per le foto selezionate
    photoIds.forEach(id => {
      const photoElement = document.getElementById(`photo-${id}`);
      if (photoElement) {
        photoElement.classList.add('bulk-assignment-animation');
        setTimeout(() => {
          photoElement.classList.remove('bulk-assignment-animation');
        }, 800);
      }
    });
    
    const updatedPhotos = photos.map(photo => {
      if (photoIds.includes(photo.id)) {
        return { 
          ...photo, 
          chapterId,
          chapterPosition: position++,
        };
      }
      return photo;
    });
    
    // Mostra messaggio di conferma nella UI
    const chapterName = chapterId 
      ? chapters.find(c => c.id === chapterId)?.title || 'un capitolo'
      : 'nessun capitolo';
    
    // Aggiungi una notifica visiva temporanea
    const container = document.querySelector('.chapters-manager-container');
    if (container) {
      const notification = document.createElement('div');
      notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-md z-50 fade-out-notification';
      notification.textContent = `${photoIds.length} foto assegnate a ${chapterName}`;
      container.appendChild(notification);
      
      setTimeout(() => {
        notification.classList.add('opacity-0');
        setTimeout(() => notification.remove(), 500);
      }, 2000);
    }
    
    onPhotosUpdate(updatedPhotos);
    setSelectedPhotos([]); // Reset della selezione dopo l'assegnazione
  };
  
  // Gestisce la selezione/deselezione di una foto
  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => 
      prev.includes(photoId)
        ? prev.filter(id => id !== photoId)
        : [...prev, photoId]
    );
  };
  
  // Seleziona tutte le foto visibili
  const selectAllVisiblePhotos = () => {
    setSelectedPhotos(filteredPhotos.map(photo => photo.id));
  };
  
  // Deseleziona tutte le foto
  const deselectAllPhotos = () => {
    setSelectedPhotos([]);
  };
  
  // Filtra le foto in base al capitolo attivo
  const filteredPhotos = activeTab === 'all' 
    ? photos 
    : activeTab === 'unassigned'
      ? photos.filter(photo => !photo.chapterId)
      : photos.filter(photo => photo.chapterId === activeTab);
  
  // Foto non assegnate ad alcun capitolo
  const unassignedPhotos = photos.filter(photo => !photo.chapterId);
  
  // Debug per vedere lo stato delle assegnazioni
  useEffect(() => {
    console.log("ChaptersManager - Stato attuale:");
    console.log(`- Totale foto: ${photos.length}`);
    console.log(`- Foto non assegnate: ${unassignedPhotos.length}`);
    console.log(`- Capitoli: ${chapters.length}`);
    
    // Conta foto per capitolo
    const countsByChapter: Record<string, number> = {};
    chapters.forEach(chapter => {
      countsByChapter[chapter.title] = photos.filter(p => p.chapterId === chapter.id).length;
    });
    console.log("Foto per capitolo:", countsByChapter);
  }, [photos, chapters, unassignedPhotos.length]);
  
  // Calcolo le statistiche per la barra di avanzamento
  const totalPhotos = photos.length;
  const assignedPhotos = photos.filter(photo => photo.chapterId).length;
  const progressPercentage = totalPhotos > 0 ? Math.round((assignedPhotos / totalPhotos) * 100) : 0;
  
  // Renderizza il componente
  return (
    <div className="w-full max-w-6xl mx-auto chapters-manager-container">
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="w-full"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">Organizza le foto in capitoli</h3>
          <Button onClick={addChapter} className="flex items-center space-x-1">
            <Plus className="h-4 w-4" />
            <span>Nuovo Capitolo</span>
          </Button>
        </div>
        
        {/* Barra di avanzamento */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              Progresso: {assignedPhotos} di {totalPhotos} foto assegnate ({progressPercentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-green-400 h-2.5 rounded-full transition-all duration-500 ease-in-out" 
              style={{ width: `${progressPercentage}%` }}
            ></div>
          </div>
        </div>
        
        <TabsList className="mb-6 flex overflow-x-auto">
          <TabsTrigger value="all">
            Tutte le foto ({photos.length})
          </TabsTrigger>
          
          <TabsTrigger value="unassigned">
            Non assegnate ({unassignedPhotos.length})
          </TabsTrigger>
          
          {chapters.map(chapter => (
            <TabsTrigger key={chapter.id} value={chapter.id}>
              {chapter.title} ({photos.filter(p => p.chapterId === chapter.id).length})
            </TabsTrigger>
          ))}
        </TabsList>
        
        {/* Sezione dei capitoli */}
        {activeTab !== 'all' && activeTab !== 'unassigned' && (
          <div className="mb-6">
            {chapters
              .filter(chapter => chapter.id === activeTab)
              .map(chapter => (
                <Card key={chapter.id} className="bg-slate-50">
                  <CardHeader className="pb-2">
                    {editingChapterId === chapter.id ? (
                      <div className="space-y-2">
                        <Input
                          value={newChapterTitle}
                          onChange={e => setNewChapterTitle(e.target.value)}
                          placeholder="Nome del capitolo"
                          className="font-medium"
                        />
                        <Input
                          value={newChapterDescription}
                          onChange={e => setNewChapterDescription(e.target.value)}
                          placeholder="Descrizione (opzionale)"
                        />
                        <div className="flex space-x-2">
                          <Button 
                            onClick={() => saveChapterEdit(chapter.id)}
                            size="sm"
                            className="flex items-center space-x-1"
                          >
                            <Check className="h-4 w-4" />
                            <span>Salva</span>
                          </Button>
                          <Button 
                            onClick={cancelChapterEdit}
                            size="sm"
                            variant="outline"
                            className="flex items-center space-x-1"
                          >
                            <X className="h-4 w-4" />
                            <span>Annulla</span>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                            <CardTitle>{chapter.title}</CardTitle>
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="flex items-center gap-1 text-xs"
                              onClick={() => setUploadToChapter({
                                isOpen: true,
                                chapterId: chapter.id,
                                chapterTitle: chapter.title,
                                galleryId: galleryId
                              })}
                            >
                              <Upload className="h-3 w-3" />
                              <span>Carica foto</span>
                            </Button>
                          </div>
                          <div className="flex space-x-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => moveChapter(chapter.id, 'up')}
                              disabled={chapter.position === 0}
                            >
                              <MoveUp className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => moveChapter(chapter.id, 'down')}
                              disabled={chapter.position === chapters.length - 1}
                            >
                              <MoveDown className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => startEditingChapter(chapter)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => removeChapter(chapter.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                        {chapter.description && (
                          <CardDescription>{chapter.description}</CardDescription>
                        )}
                      </>
                    )}
                  </CardHeader>
                </Card>
              ))}
          </div>
        )}
        
        {/* Barra degli strumenti di selezione multipla */}
        {selectedPhotos.length > 0 && (
          <div className="bg-blue-gray/10 p-3 rounded-lg mb-4 flex justify-between items-center">
            <div>
              <span className="font-medium">{selectedPhotos.length} foto selezionate</span>
            </div>
            <div className="flex space-x-2">
              <Button size="sm" variant="outline" onClick={deselectAllPhotos}>
                Deseleziona
              </Button>
              
              {chapters.length > 0 && (
                <div className="flex space-x-2">
                  <select 
                    value={bulkActionChapter || ''}
                    onChange={(e) => setBulkActionChapter(e.target.value === '' ? null : e.target.value)}
                    className="px-3 py-1 rounded border"
                  >
                    <option value="">Scegli capitolo...</option>
                    {chapters.map(chapter => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                    <option value="unassign">-- Rimuovi da capitoli --</option>
                  </select>
                  
                  <Button 
                    size="sm" 
                    onClick={() => {
                      if (bulkActionChapter === 'unassign') {
                        assignMultiplePhotosToChapter(selectedPhotos, undefined);
                      } else if (bulkActionChapter) {
                        assignMultiplePhotosToChapter(selectedPhotos, bulkActionChapter);
                      }
                    }}
                    disabled={!bulkActionChapter}
                  >
                    Assegna
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
        
        {/* Toolbar seleziona tutto */}
        <div className="flex justify-between items-center mb-4">
          <div>
            <span className="text-sm text-muted-foreground">
              {filteredPhotos.length} foto visualizzate
            </span>
          </div>
          <div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={filteredPhotos.length > 0 ? selectAllVisiblePhotos : undefined}
              disabled={filteredPhotos.length === 0}
            >
              Seleziona tutte
            </Button>
          </div>
        </div>
        
        {/* Mostra le foto */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredPhotos.map(photo => (
            <Card 
              key={photo.id}
              id={`photo-${photo.id}`}
              className={cn(
                "overflow-hidden border-2", 
                selectedPhotos.includes(photo.id) 
                  ? "border-blue-gray" 
                  : "border-transparent hover:border-gray-200"
              )}
              onClick={() => togglePhotoSelection(photo.id)}
            >
              <div className="aspect-square relative">
                {selectedPhotos.includes(photo.id) && (
                  <div className="absolute top-2 right-2 z-10 bg-blue-gray text-white rounded-full h-6 w-6 flex items-center justify-center">
                    <Check className="h-4 w-4" />
                  </div>
                )}
                {onDeletePhoto && photo.id && (
                  <button
                    className="absolute top-2 left-2 z-10 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center cursor-pointer hover:bg-red-600"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Sei sicuro di voler eliminare questa foto (${photo.name})? Questa azione è irreversibile.`)) {
                        onDeletePhoto(photo);
                      }
                    }}
                    title="Elimina foto"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
                <img 
                  src={photo.url} 
                  alt={photo.name} 
                  className="w-full h-full object-cover"
                />
              </div>
              <CardFooter className="p-2 flex-col items-start">
                <p className="text-xs truncate w-full">{photo.name}</p>
                <div className="w-full mt-2">
                  <Label htmlFor={`chapter-select-${photo.id}`} className="text-xs">
                    Capitolo:
                  </Label>
                  <select
                    id={`chapter-select-${photo.id}`}
                    value={photo.chapterId || ''}
                    onChange={(e) => assignPhotoToChapter(photo.id, e.target.value || undefined)}
                    className="w-full mt-1 text-xs border border-gray-200 rounded p-1"
                  >
                    <option value="">Non assegnata</option>
                    {chapters.map(chapter => (
                      <option key={chapter.id} value={chapter.id}>
                        {chapter.title}
                      </option>
                    ))}
                  </select>
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      </Tabs>
      
      {/* Componente per caricare foto direttamente in un capitolo specifico */}
      {uploadToChapter.isOpen && (
        <PhotoUploadToChapter
          isOpen={uploadToChapter.isOpen}
          onClose={() => setUploadToChapter({ isOpen: false, chapterId: '', chapterTitle: '' })}
          galleryId={uploadToChapter.galleryId || ''}
          chapterId={uploadToChapter.chapterId}
          chapterTitle={uploadToChapter.chapterTitle}
          onPhotosUploaded={(newPhotos) => {
            // Aggiungiamo le nuove foto all'array esistente
            onPhotosUpdate([...photos, ...newPhotos]);
          }}
        />
      )}
    </div>
  );
}
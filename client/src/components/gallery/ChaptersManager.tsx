/**
 * ChaptersManager - Gestione capitoli galleria
 * Tab per organizzare le foto in capitoli
 */

import { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { 
  Plus, 
  GripVertical, 
  Folder, 
  FolderOpen, 
  Image as ImageIcon,
  Trash2, 
  Edit2, 
  MoreVertical, 
  CheckCircle,
  FolderPlus,
  ArrowRight,
  X,
  Loader2,
  ImagePlus,
  Check,
  Move,
  Crosshair
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Gallery, Chapter } from '@/lib/galleries';
import { ChapterService } from '@/lib/chapters';
import { PhotoService, type Photo } from '@/lib/photos';

interface ChaptersManagerProps {
  gallery: Gallery;
  galleryId: string;
}

const ChapterItem = memo(({ 
  chapter, 
  isActive, 
  photoCount, 
  onClick, 
  onEdit, 
  onDelete,
  onSetCover
}: { 
  chapter: Chapter; 
  isActive: boolean; 
  photoCount: number;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSetCover: () => void;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: chapter.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all group",
        isActive 
          ? "border-sage bg-sage/10 shadow-md" 
          : "border-gray-200 hover:border-sage/50 hover:bg-gray-50"
      )}
      onClick={onClick}
      data-testid={`chapter-item-${chapter.id}`}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-200 rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>
      
      {isActive ? (
        <FolderOpen className="w-5 h-5 text-sage" />
      ) : (
        <Folder className="w-5 h-5 text-gray-500" />
      )}
      
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{chapter.titolo}</p>
        {chapter.descrizione && (
          <p className="text-xs text-gray-500 truncate">{chapter.descrizione}</p>
        )}
        {chapter.excludeFromSelection && (
          <Badge variant="outline" className="text-[10px] mt-0.5 border-amber-400 text-amber-700 bg-amber-50">
            Escluso da selezioni
          </Badge>
        )}
      </div>
      
      <Badge variant="secondary" className="text-xs shrink-0">
        {photoCount}
      </Badge>
      
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-7 w-7"
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Edit2 className="w-4 h-4 mr-2" />
            Modifica
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onSetCover}>
            <ImageIcon className="w-4 h-4 mr-2" />
            Imposta copertina
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-red-600">
            <Trash2 className="w-4 h-4 mr-2" />
            Elimina
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
ChapterItem.displayName = 'ChapterItem';

const PhotoGridItem = memo(({ 
  photo, 
  isSelected, 
  onToggle,
  onDelete,
  isDragging,
  registerRef
}: { 
  photo: Photo; 
  isSelected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  isDragging?: boolean;
  registerRef?: (el: HTMLDivElement | null) => void;
}) => {
  return (
    <div
      ref={registerRef}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all group select-none",
        isSelected 
          ? "border-sage shadow-lg ring-2 ring-sage/50" 
          : "border-gray-200 hover:border-sage/50",
        isDragging && "opacity-50"
      )}
      onClick={onToggle}
      data-testid={`chapter-photo-${photo.id}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '200px 200px' }}
    >
      <img
        src={photo.thumbnailUrl || photo.url}
        alt={photo.name}
        className="w-full h-full object-cover pointer-events-none"
        loading="lazy"
        decoding="async"
        draggable={false}
      />
      
      {/* Checkbox selezione */}
      <div className={cn(
        "absolute top-2 left-2 transition-opacity pointer-events-none",
        isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      )}>
        <div className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center border-2",
          isSelected 
            ? "bg-sage border-sage text-white" 
            : "bg-white/90 border-gray-300"
        )}>
          {isSelected && <Check className="w-4 h-4" />}
        </div>
      </div>

      {/* Bottone elimina singola foto (hover) */}
      <button
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md z-10"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="Elimina foto"
        type="button"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      
      {photo.chapterId && (
        <div className="absolute bottom-2 right-2 pointer-events-none">
          <Badge variant="secondary" className="text-xs bg-white/90">
            <Folder className="w-3 h-3 mr-1" />
          </Badge>
        </div>
      )}
    </div>
  );
});
PhotoGridItem.displayName = 'PhotoGridItem';

/** Editor di riposizionamento della copertina capitolo */
const CoverPositionEditor = memo(({
  photo,
  initialPosition,
  chapterTitle,
  onSave,
  onCancel,
  isSaving
}: {
  photo: Photo;
  initialPosition: { x: number; y: number };
  chapterTitle: string;
  onSave: (pos: { x: number; y: number }) => void;
  onCancel: () => void;
  isSaving?: boolean;
}) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number, clientY: number) => {
    const container = imageContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100));
    setPosition({ x: Math.round(x), y: Math.round(y) });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    updatePosition(e.clientX, e.clientY);
  }, [updatePosition]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    updatePosition(e.clientX, e.clientY);
  }, [isDragging, updatePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const onUp = () => setIsDragging(false);
    window.addEventListener('mouseup', onUp);
    return () => window.removeEventListener('mouseup', onUp);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 flex items-center gap-2">
        <Crosshair className="w-4 h-4 text-sage" />
        Clicca o trascina sull'immagine per spostare il punto di fuoco. La preview mostra come apparirà la card del capitolo.
      </p>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
        {/* Editor immagine con punto di fuoco */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Immagine originale — trascina per posizionare
          </p>
          <div
            ref={imageContainerRef}
            className="relative w-full rounded-xl overflow-hidden border-2 border-sage/30 select-none"
            style={{ aspectRatio: '3/2', cursor: isDragging ? 'grabbing' : 'crosshair' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            <img
              src={photo.url}
              alt={photo.name}
              className="w-full h-full object-cover pointer-events-none"
              draggable={false}
            />
            {/* Overlay scuro semi-trasparente */}
            <div className="absolute inset-0 bg-black/25 pointer-events-none" />
            {/* Crosshair */}
            <div
              className="absolute pointer-events-none"
              style={{
                left: `${position.x}%`,
                top: `${position.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {/* Cerchio esterno */}
              <div className="w-10 h-10 rounded-full border-2 border-white/80 shadow-lg flex items-center justify-center backdrop-blur-[1px]">
                <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
              </div>
              {/* Linee crosshair */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/60 -translate-x-1/2 pointer-events-none" style={{ height: '40px', top: '50%', transform: 'translate(-50%, -50%)' }} />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-white/60 -translate-y-1/2 pointer-events-none" style={{ width: '40px', left: '50%', transform: 'translate(-50%, -50%)' }} />
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">
            Punto: {Math.round(position.x)}% × {Math.round(position.y)}%
          </p>
        </div>

        {/* Preview card capitolo */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-600 uppercase tracking-wide">
            Preview card capitolo
          </p>
          <div
            className="relative rounded-xl overflow-hidden shadow-lg border border-gray-200"
            style={{ aspectRatio: '3/4', maxWidth: '200px', margin: '0 auto' }}
          >
            <img
              src={photo.url}
              alt="Preview"
              className="w-full h-full object-cover pointer-events-none"
              style={{ objectPosition: `${position.x}% ${position.y}%` }}
              draggable={false}
            />
            {/* Gradient overlay come in gallery */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
              <p className="font-semibold text-sm line-clamp-2">{chapterTitle}</p>
              <p className="text-xs text-white/70 mt-0.5">Anteprima</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center">Aspect ratio 3:4</p>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t">
        <Button variant="outline" onClick={onCancel} disabled={isSaving}>
          Indietro
        </Button>
        <Button
          onClick={() => onSave(position)}
          disabled={isSaving}
          className="bg-sage hover:bg-sage/90"
        >
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Salva posizione
        </Button>
      </div>
    </div>
  );
});
CoverPositionEditor.displayName = 'CoverPositionEditor';

export default function ChaptersManager({ gallery, galleryId }: ChaptersManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [activeChapter, setActiveChapter] = useState<string | 'unassigned' | 'all'>('all');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCoverDialog, setShowCoverDialog] = useState(false);
  const [coverChapter, setCoverChapter] = useState<Chapter | null>(null);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [newChapterDescription, setNewChapterDescription] = useState('');
  const [newChapterExcludeFromSelection, setNewChapterExcludeFromSelection] = useState(false);
  const [dragActiveId, setDragActiveId] = useState<string | null>(null);
  // Position editor
  const [positionEditorPhoto, setPositionEditorPhoto] = useState<Photo | null>(null);
  
  // Drag-to-select state
  const gridRef = useRef<HTMLDivElement>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ x: number; y: number } | null>(null);
  const photoRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didDragSelect = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const chapters = useMemo(() => 
    ChapterService.getOrderedChapters(gallery),
    [gallery.chapters]
  );

  const { data: allPhotos = [], isLoading: isLoadingPhotos } = useQuery({
    queryKey: ['gallery-photos', galleryId],
    queryFn: () => PhotoService.getGalleryPhotos(galleryId, undefined, 'exclude-guest'),
    enabled: !!galleryId
  });

  const { data: photoCounts = {} } = useQuery({
    queryKey: ['photo-counts-by-chapter', galleryId],
    queryFn: () => PhotoService.countPhotosByChapter(galleryId),
    enabled: !!galleryId
  });

  const filteredPhotos = useMemo(() => {
    if (activeChapter === 'all') return allPhotos;
    if (activeChapter === 'unassigned') return allPhotos.filter(p => !p.chapterId);
    return allPhotos.filter(p => p.chapterId === activeChapter);
  }, [allPhotos, activeChapter]);

  const PHOTOS_PER_PAGE = 100;
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeChapter]);

  const totalPages = Math.max(1, Math.ceil(filteredPhotos.length / PHOTOS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * PHOTOS_PER_PAGE;
  const endIdx = startIdx + PHOTOS_PER_PAGE;
  const paginatedPhotos = useMemo(
    () => filteredPhotos.slice(startIdx, endIdx),
    [filteredPhotos, startIdx, endIdx]
  );

  const createChapterMutation = useMutation({
    mutationFn: async () => {
      return ChapterService.createChapter(galleryId, newChapterTitle, newChapterDescription, newChapterExcludeFromSelection);
    },
    onSuccess: () => {
      toast({ title: 'Capitolo creato', description: `"${newChapterTitle}" aggiunto alla galleria` });
      setShowCreateDialog(false);
      setNewChapterTitle('');
      setNewChapterDescription('');
      setNewChapterExcludeFromSelection(false);
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    },
    onError: (err) => {
      toast({ title: 'Errore', description: 'Impossibile creare il capitolo', variant: 'destructive' });
    }
  });

  const updateChapterMutation = useMutation({
    mutationFn: async ({ chapterId, updates }: { chapterId: string; updates: Partial<Chapter> }) => {
      return ChapterService.updateChapter(galleryId, gallery, chapterId, updates);
    },
    onSuccess: () => {
      toast({ title: 'Capitolo aggiornato' });
      setShowEditDialog(false);
      setEditingChapter(null);
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    }
  });

  const deleteChapterMutation = useMutation({
    mutationFn: async (chapterId: string) => {
      const photosInChapter = allPhotos.filter(p => p.chapterId === chapterId);
      if (photosInChapter.length > 0) {
        await PhotoService.removePhotosFromChapter(photosInChapter.map(p => p.id));
      }
      return ChapterService.deleteChapter(galleryId, gallery, chapterId);
    },
    onSuccess: () => {
      toast({ title: 'Capitolo eliminato', description: 'Le foto sono state spostate in "Non assegnate"' });
      if (typeof activeChapter === 'string' && activeChapter !== 'all' && activeChapter !== 'unassigned') {
        setActiveChapter('all');
      }
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', galleryId] });
      queryClient.invalidateQueries({ queryKey: ['photo-counts-by-chapter', galleryId] });
    }
  });

  const reorderChaptersMutation = useMutation({
    mutationFn: async (reordered: Chapter[]) => {
      return ChapterService.reorderChapters(galleryId, reordered);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    }
  });

  const assignPhotosMutation = useMutation({
    mutationFn: async ({ photoIds, chapterId }: { photoIds: string[]; chapterId: string | null }) => {
      return PhotoService.assignPhotosToChapter(photoIds, chapterId);
    },
    onSuccess: (_, variables) => {
      const count = variables.photoIds.length;
      const chapterName = variables.chapterId 
        ? chapters.find(c => c.id === variables.chapterId)?.titolo 
        : 'Non assegnate';
      toast({ 
        title: 'Foto spostate', 
        description: `${count} foto spostate in "${chapterName}"` 
      });
      setSelectedPhotos(new Set());
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', galleryId] });
      queryClient.invalidateQueries({ queryKey: ['photo-counts-by-chapter', galleryId] });
    }
  });

  const deletePhotosMutation = useMutation({
    mutationFn: async (photoIds: string[]) => {
      await Promise.all(photoIds.map(id => PhotoService.deletePhoto(id)));
    },
    onSuccess: (_, photoIds) => {
      toast({ title: `${photoIds.length} foto eliminate` });
      setSelectedPhotos(new Set());
      queryClient.invalidateQueries({ queryKey: ['gallery-photos', galleryId] });
      queryClient.invalidateQueries({ queryKey: ['photo-counts-by-chapter', galleryId] });
    },
    onError: () => {
      toast({ title: 'Errore', description: 'Impossibile eliminare le foto', variant: 'destructive' });
    }
  });

  const handleDeletePhotos = (photoIds: string[]) => {
    const count = photoIds.length;
    if (!confirm(`Eliminare ${count === 1 ? 'questa foto' : `queste ${count} foto`}? L'operazione è irreversibile.`)) return;
    deletePhotosMutation.mutate(photoIds);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setDragActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDragActiveId(null);
    const { active, over } = event;
    
    if (!over || active.id === over.id) return;
    
    const oldIndex = chapters.findIndex(c => c.id === active.id);
    const newIndex = chapters.findIndex(c => c.id === over.id);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const reordered = arrayMove(chapters, oldIndex, newIndex);
      reorderChaptersMutation.mutate(reordered);
    }
  };

  const handleTogglePhoto = useCallback((photoId: string) => {
    // Skip if we just did a drag selection
    if (didDragSelect.current) return;
    
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedPhotos(new Set(filteredPhotos.map(p => p.id)));
  }, [filteredPhotos]);

  const handleDeselectAll = useCallback(() => {
    setSelectedPhotos(new Set());
  }, []);

  // Drag-to-select handlers
  const getSelectionBox = useCallback(() => {
    if (!selectionStart || !selectionEnd) return null;
    return {
      left: Math.min(selectionStart.x, selectionEnd.x),
      top: Math.min(selectionStart.y, selectionEnd.y),
      width: Math.abs(selectionEnd.x - selectionStart.x),
      height: Math.abs(selectionEnd.y - selectionStart.y)
    };
  }, [selectionStart, selectionEnd]);

  const isElementInSelection = useCallback((element: HTMLDivElement, box: { left: number; top: number; width: number; height: number }) => {
    const rect = element.getBoundingClientRect();
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect) return false;
    
    const elLeft = rect.left - gridRect.left;
    const elTop = rect.top - gridRect.top;
    const elRight = elLeft + rect.width;
    const elBottom = elTop + rect.height;
    
    const boxRight = box.left + box.width;
    const boxBottom = box.top + box.height;
    
    return !(elLeft > boxRight || elRight < box.left || elTop > boxBottom || elBottom < box.top);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, [role="checkbox"]')) return;
    
    const gridRect = gridRef.current?.getBoundingClientRect();
    if (!gridRect) return;
    
    const x = e.clientX - gridRect.left;
    const y = e.clientY - gridRect.top;
    
    setIsSelecting(true);
    setSelectionStart({ x, y });
    setSelectionEnd({ x, y });
    
    if (!e.shiftKey) {
      setSelectedPhotos(new Set());
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !gridRef.current) return;
    
    const gridRect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - gridRect.left;
    const y = e.clientY - gridRect.top;
    
    setSelectionEnd({ x, y });
  }, [isSelecting]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting) return;
    
    const box = getSelectionBox();
    if (box && box.width > 10 && box.height > 10) {
      didDragSelect.current = true;
      const newSelected = new Set(selectedPhotos);
      
      photoRefs.current.forEach((element, photoId) => {
        if (isElementInSelection(element, box)) {
          newSelected.add(photoId);
        }
      });
      
      setSelectedPhotos(newSelected);
      
      // Reset flag after a short delay to allow click events to be suppressed
      setTimeout(() => {
        didDragSelect.current = false;
      }, 100);
    }
    
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }, [isSelecting, getSelectionBox, isElementInSelection, selectedPhotos]);

  // Global mouse up listener
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelecting) {
        handleMouseUp();
      }
    };
    
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isSelecting, handleMouseUp]);

  const registerPhotoRef = useCallback((photoId: string, element: HTMLDivElement | null) => {
    if (element) {
      photoRefs.current.set(photoId, element);
    } else {
      photoRefs.current.delete(photoId);
    }
  }, []);

  const handleEditChapter = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setNewChapterTitle(chapter.titolo);
    setNewChapterDescription(chapter.descrizione || '');
    setNewChapterExcludeFromSelection(chapter.excludeFromSelection === true);
    setShowEditDialog(true);
  };

  const handleSetCover = (chapter: Chapter) => {
    setCoverChapter(chapter);
    setShowCoverDialog(true);
  };

  const handleSelectCoverPhoto = (photo: Photo) => {
    if (!coverChapter) return;
    // Apri l'editor di posizionamento
    setPositionEditorPhoto(photo);
  };

  const handleSaveCoverPosition = (position: { x: number; y: number }) => {
    if (!coverChapter || !positionEditorPhoto) return;
    updateChapterMutation.mutate(
      {
        chapterId: coverChapter.id,
        updates: {
          coverPhotoId: positionEditorPhoto.id,
          coverPhotoUrl: positionEditorPhoto.url,
          coverPhotoPosition: position
        }
      },
      {
        onSuccess: () => {
          setPositionEditorPhoto(null);
          setShowCoverDialog(false);
          setCoverChapter(null);
        }
      }
    );
  };

  const coverPhotos = useMemo(() => {
    if (!coverChapter) return [];
    return allPhotos.filter(p => p.chapterId === coverChapter.id);
  }, [allPhotos, coverChapter]);

  const handleDeleteChapter = (chapterId: string) => {
    const chapter = chapters.find(c => c.id === chapterId);
    const photoCount = photoCounts[chapterId] || 0;
    
    if (!confirm(`Eliminare il capitolo "${chapter?.titolo}"?\n\n${photoCount > 0 ? `Le ${photoCount} foto verranno spostate in "Non assegnate".` : 'Il capitolo è vuoto.'}`)) {
      return;
    }
    
    deleteChapterMutation.mutate(chapterId);
  };

  const handleMoveToChapter = (chapterId: string | null) => {
    if (selectedPhotos.size === 0) return;
    assignPhotosMutation.mutate({ 
      photoIds: Array.from(selectedPhotos), 
      chapterId 
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Folder className="w-5 h-5" />
              Organizza in Capitoli
            </CardTitle>
            <CardDescription>
              Organizza le foto in sezioni logiche (es. Preparazione, Cerimonia, Ricevimento)
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-chapter">
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Capitolo
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <h4 className="font-semibold text-sm text-gray-700 mb-3">Capitoli</h4>
            
            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all",
                activeChapter === 'all' 
                  ? "border-sage bg-sage/10" 
                  : "border-gray-200 hover:border-sage/50"
              )}
              onClick={() => setActiveChapter('all')}
              data-testid="chapter-all"
            >
              <ImageIcon className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-sm flex-1">Tutte le foto</span>
              <Badge variant="secondary">{allPhotos.length}</Badge>
            </div>
            
            <div
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-all",
                activeChapter === 'unassigned' 
                  ? "border-amber-500 bg-amber-50" 
                  : "border-dashed border-gray-300 hover:border-amber-300"
              )}
              onClick={() => setActiveChapter('unassigned')}
              data-testid="chapter-unassigned"
            >
              <FolderPlus className="w-5 h-5 text-amber-600" />
              <span className="font-medium text-sm flex-1">Non assegnate</span>
              <Badge variant="outline" className="border-amber-300 text-amber-700">
                {photoCounts.unassigned || 0}
              </Badge>
            </div>
            
            {chapters.length > 0 && (
              <div className="border-t pt-4 mt-4">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={chapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-2">
                      {chapters.map(chapter => (
                        <ChapterItem
                          key={chapter.id}
                          chapter={chapter}
                          isActive={activeChapter === chapter.id}
                          photoCount={photoCounts[chapter.id] || 0}
                          onClick={() => setActiveChapter(chapter.id)}
                          onEdit={() => handleEditChapter(chapter)}
                          onDelete={() => handleDeleteChapter(chapter.id)}
                          onSetCover={() => handleSetCover(chapter)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                  
                  <DragOverlay>
                    {dragActiveId && (
                      <div className="p-3 bg-white rounded-lg border-2 border-sage shadow-lg">
                        <div className="flex items-center gap-2">
                          <Folder className="w-5 h-5 text-sage" />
                          <span className="font-medium text-sm">
                            {chapters.find(c => c.id === dragActiveId)?.titolo}
                          </span>
                        </div>
                      </div>
                    )}
                  </DragOverlay>
                </DndContext>
              </div>
            )}
            
            {chapters.length === 0 && (
              <div className="text-center py-6 text-gray-500 text-sm">
                <Folder className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p>Nessun capitolo creato</p>
                <p className="text-xs">Clicca "Nuovo Capitolo" per iniziare</p>
              </div>
            )}
          </div>
          
          <div className="lg:col-span-3">
            {selectedPhotos.size > 0 && (
              <div className="bg-sage/10 border-2 border-sage rounded-lg p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-sage" />
                  <span className="font-medium">{selectedPhotos.size} foto selezionate</span>
                </div>
                
                <div className="flex items-center gap-2 flex-wrap">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="default" size="sm" disabled={assignPhotosMutation.isPending}>
                        {assignPhotosMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4 mr-2" />
                        )}
                        Sposta in...
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem onClick={() => handleMoveToChapter(null)}>
                        <FolderPlus className="w-4 h-4 mr-2 text-amber-600" />
                        Non assegnate
                      </DropdownMenuItem>
                      {chapters.length > 0 && <DropdownMenuSeparator />}
                      {chapters.map(chapter => (
                        <DropdownMenuItem 
                          key={chapter.id} 
                          onClick={() => handleMoveToChapter(chapter.id)}
                        >
                          <Folder className="w-4 h-4 mr-2" />
                          {chapter.titolo}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeletePhotos(Array.from(selectedPhotos))}
                    disabled={deletePhotosMutation.isPending}
                  >
                    {deletePhotosMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Elimina
                  </Button>

                  <Button variant="outline" size="sm" onClick={handleDeselectAll}>
                    <X className="w-4 h-4 mr-2" />
                    Deseleziona
                  </Button>
                </div>
              </div>
            )}
            
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-sm text-gray-700">
                {activeChapter === 'all' && 'Tutte le foto'}
                {activeChapter === 'unassigned' && 'Foto non assegnate'}
                {typeof activeChapter === 'string' && activeChapter !== 'all' && activeChapter !== 'unassigned' && (
                  chapters.find(c => c.id === activeChapter)?.titolo
                )}
                <span className="font-normal text-gray-500 ml-2">
                  ({filteredPhotos.length} foto)
                </span>
              </h4>
              
              {filteredPhotos.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  Seleziona tutte
                </Button>
              )}
            </div>
            
            {isLoadingPhotos ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-sage" />
              </div>
            ) : filteredPhotos.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <ImagePlus className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">Nessuna foto</p>
                <p className="text-sm">
                  {activeChapter === 'unassigned' 
                    ? 'Tutte le foto sono già assegnate a un capitolo' 
                    : 'Questo capitolo è vuoto'}
                </p>
              </div>
            ) : (
              <>
                {filteredPhotos.length > PHOTOS_PER_PAGE && (
                  <div className="flex items-center justify-between mb-3 p-2.5 bg-sage/5 rounded-lg border border-sage/20" data-testid="chapters-pagination-top">
                    <p className="text-xs text-gray-700">
                      Foto <strong>{startIdx + 1}–{Math.min(endIdx, filteredPhotos.length)}</strong> di <strong>{filteredPhotos.length}</strong>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={safePage === 1}
                        data-testid="chapters-btn-prev-top"
                      >
                        ←
                      </Button>
                      <span className="text-xs font-medium px-1.5">
                        {safePage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={safePage === totalPages}
                        data-testid="chapters-btn-next-top"
                      >
                        →
                      </Button>
                    </div>
                  </div>
                )}
                <div 
                  ref={gridRef}
                  className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 relative select-none"
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  style={{ cursor: isSelecting ? 'crosshair' : 'default' }}
                >
                  {paginatedPhotos.map(photo => (
                    <PhotoGridItem
                      key={photo.id}
                      photo={photo}
                      isSelected={selectedPhotos.has(photo.id)}
                      onToggle={() => handleTogglePhoto(photo.id)}
                      onDelete={() => handleDeletePhotos([photo.id])}
                      registerRef={(el) => registerPhotoRef(photo.id, el)}
                    />
                  ))}
                  
                  {/* Selection rectangle */}
                  {isSelecting && selectionStart && selectionEnd && (
                    <div
                      className="absolute border-2 border-sage bg-sage/20 pointer-events-none z-50"
                      style={{
                        left: Math.min(selectionStart.x, selectionEnd.x),
                        top: Math.min(selectionStart.y, selectionEnd.y),
                        width: Math.abs(selectionEnd.x - selectionStart.x),
                        height: Math.abs(selectionEnd.y - selectionStart.y)
                      }}
                    />
                  )}
                </div>
                {filteredPhotos.length > PHOTOS_PER_PAGE && (
                  <div className="flex items-center justify-between mt-3 p-2.5 bg-sage/5 rounded-lg border border-sage/20" data-testid="chapters-pagination-bottom">
                    <p className="text-xs text-gray-700">
                      Foto <strong>{startIdx + 1}–{Math.min(endIdx, filteredPhotos.length)}</strong> di <strong>{filteredPhotos.length}</strong>
                    </p>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentPage(p => Math.max(1, p - 1));
                          gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        disabled={safePage === 1}
                        data-testid="chapters-btn-prev-bottom"
                      >
                        ← Precedente
                      </Button>
                      <span className="text-xs font-medium px-1.5">
                        {safePage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setCurrentPage(p => Math.min(totalPages, p + 1));
                          gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        disabled={safePage === totalPages}
                        data-testid="chapters-btn-next-bottom"
                      >
                        Successiva →
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo Capitolo</DialogTitle>
            <DialogDescription>
              Crea un nuovo capitolo per organizzare le foto della galleria.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Titolo *</label>
              <Input
                placeholder="Es. Preparazione Sposa"
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
                data-testid="input-chapter-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Descrizione (opzionale)</label>
              <Textarea
                placeholder="Descrizione del capitolo..."
                value={newChapterDescription}
                onChange={(e) => setNewChapterDescription(e.target.value)}
                rows={3}
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg border border-amber-200 bg-amber-50">
              <Checkbox
                checked={newChapterExcludeFromSelection}
                onCheckedChange={(v) => setNewChapterExcludeFromSelection(v === true)}
                className="mt-0.5"
                data-testid="checkbox-exclude-from-selection-create"
              />
              <span className="text-sm">
                <span className="font-medium">Escludi da future selezioni</span>
                <span className="block text-xs text-gray-600 mt-0.5">
                  Le foto di questo capitolo restano visibili al cliente ma non si potranno selezionare
                  (vale sia per la selezione normale che per quella inversa).
                </span>
              </span>
            </label>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Annulla
            </Button>
            <Button 
              onClick={() => createChapterMutation.mutate()}
              disabled={!newChapterTitle.trim() || createChapterMutation.isPending}
              data-testid="button-confirm-create-chapter"
            >
              {createChapterMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crea Capitolo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifica Capitolo</DialogTitle>
            <DialogDescription>
              Modifica titolo e descrizione del capitolo.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Titolo *</label>
              <Input
                placeholder="Es. Preparazione Sposa"
                value={newChapterTitle}
                onChange={(e) => setNewChapterTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Descrizione (opzionale)</label>
              <Textarea
                placeholder="Descrizione del capitolo..."
                value={newChapterDescription}
                onChange={(e) => setNewChapterDescription(e.target.value)}
                rows={3}
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer p-3 rounded-lg border border-amber-200 bg-amber-50">
              <Checkbox
                checked={newChapterExcludeFromSelection}
                onCheckedChange={(v) => setNewChapterExcludeFromSelection(v === true)}
                className="mt-0.5"
                data-testid="checkbox-exclude-from-selection-edit"
              />
              <span className="text-sm">
                <span className="font-medium">Escludi da future selezioni</span>
                <span className="block text-xs text-gray-600 mt-0.5">
                  Le foto di questo capitolo restano visibili al cliente ma non si potranno selezionare
                  (vale sia per la selezione normale che per quella inversa).
                </span>
              </span>
            </label>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Annulla
            </Button>
            <Button 
              onClick={() => {
                if (editingChapter) {
                  updateChapterMutation.mutate({
                    chapterId: editingChapter.id,
                    updates: { 
                      titolo: newChapterTitle, 
                      descrizione: newChapterDescription,
                      excludeFromSelection: newChapterExcludeFromSelection
                    }
                  });
                }
              }}
              disabled={!newChapterTitle.trim() || updateChapterMutation.isPending}
            >
              {updateChapterMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva Modifiche
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showCoverDialog} onOpenChange={(open) => {
        setShowCoverDialog(open);
        if (!open) {
          setCoverChapter(null);
          setPositionEditorPhoto(null);
        }
      }}>
        <DialogContent className={positionEditorPhoto ? "max-w-3xl" : "max-w-2xl"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {positionEditorPhoto ? (
                <>
                  <Crosshair className="w-5 h-5 text-sage" />
                  Posiziona la copertina — {coverChapter?.titolo}
                </>
              ) : (
                <>
                  <ImageIcon className="w-5 h-5" />
                  Scegli foto copertina — {coverChapter?.titolo}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {positionEditorPhoto
                ? 'Trascina il mirino sull\'immagine per centrare il punto di interesse nella card del capitolo.'
                : 'Seleziona una foto del capitolo da usare come copertina, poi potrai riposizionarla.'}
            </DialogDescription>
          </DialogHeader>
          
          {positionEditorPhoto ? (
            <CoverPositionEditor
              photo={positionEditorPhoto}
              initialPosition={coverChapter?.coverPhotoPosition ?? { x: 50, y: 50 }}
              chapterTitle={coverChapter?.titolo ?? ''}
              onSave={handleSaveCoverPosition}
              onCancel={() => setPositionEditorPhoto(null)}
              isSaving={updateChapterMutation.isPending}
            />
          ) : (
            <>
              <div className="py-4">
                {coverPhotos.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Nessuna foto in questo capitolo</p>
                    <p className="text-sm">Aggiungi foto al capitolo per poter selezionare una copertina</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto">
                    {coverPhotos.map(photo => (
                      <div
                        key={photo.id}
                        onClick={() => handleSelectCoverPhoto(photo)}
                        className={cn(
                          "relative aspect-square rounded-lg overflow-hidden border-2 cursor-pointer transition-all group",
                          coverChapter?.coverPhotoId === photo.id
                            ? "border-sage ring-2 ring-sage/50"
                            : "border-gray-200 hover:border-sage/50"
                        )}
                        data-testid={`cover-photo-${photo.id}`}
                        style={{ contentVisibility: 'auto', containIntrinsicSize: '200px 200px' }}
                      >
                        <img
                          src={photo.thumbnailUrl || photo.url}
                          alt={photo.name}
                          className="w-full h-full object-cover"
                          style={
                            coverChapter?.coverPhotoId === photo.id && coverChapter?.coverPhotoPosition
                              ? { objectPosition: `${coverChapter.coverPhotoPosition.x}% ${coverChapter.coverPhotoPosition.y}%` }
                              : {}
                          }
                          loading="lazy"
                          decoding="async"
                        />
                        {coverChapter?.coverPhotoId === photo.id && (
                          <div className="absolute top-2 right-2 bg-sage text-white rounded-full p-1">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 text-white text-sm font-medium bg-black/50 px-3 py-1 rounded flex items-center gap-1.5">
                            <Move className="w-3.5 h-3.5" />
                            {coverChapter?.coverPhotoId === photo.id ? 'Riposiziona' : 'Seleziona'}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setShowCoverDialog(false);
                  setCoverChapter(null);
                }}>
                  Annulla
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

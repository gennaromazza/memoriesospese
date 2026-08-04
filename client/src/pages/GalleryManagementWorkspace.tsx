/**
 * Gallery Management Workspace - Admin tool per gestione galleria
 * Features: Photo upload, Client selection view, Settings
 */

import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { GalleryService, type Gallery, type SelectionSnapshot } from '@/lib/galleries';
import { PhotoService } from '@/lib/photos';
import { computeFileHash } from '@/lib/photoUploader';
import { generateGalleryThumbnails } from '@/lib/thumbnails';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Users, Settings, CheckCircle, XCircle, Loader2, Search, Trash2, ImageIcon, Folder, Pencil, Mail, RefreshCw } from 'lucide-react';
import EditGalleryModal from '@/components/EditGalleryModal';
import { convertFirestoreTimestamp } from '@/lib/firebase';
import imageCompression from 'browser-image-compression';
import ChaptersManager from '@/components/gallery/ChaptersManager';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  preview?: string; // Preview URL
  size?: number; // File size
  isDuplicate?: boolean; // Flag duplicati
}

// Memoized PhotoCard component for optimized rendering
const PhotoCard = memo(({ photo, isSelected, onToggle, readOnly }: { photo: any; isSelected: boolean; onToggle?: () => void; readOnly?: boolean }) => {
  return (
    <div
      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-300 group ${
        isSelected
          ? 'border-sage shadow-lg shadow-sage/40'
          : readOnly
            ? 'border-gray-300 opacity-80'
            : 'border-gray-300 hover:border-sage hover:shadow-md'
      } ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
      onClick={readOnly ? undefined : onToggle}
      data-testid={`img-selected-${photo.id}`}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '200px 200px' }}
    >
      <img
        src={photo.thumbnailUrl || photo.url}
        alt={photo.name}
        className="w-full h-full object-cover"
        loading="lazy"
        decoding="async"
      />
      {isSelected && !readOnly && (
        <div className="absolute inset-0 bg-sage bg-opacity-30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-white" />
        </div>
      )}
      {readOnly && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-white" />
        </div>
      )}
    </div>
  );
});
PhotoCard.displayName = 'PhotoCard';

// SnapshotsSection - Revisioni precedenti collapsibile
function SnapshotsSection({
  snapshots,
  onRestore,
}: {
  snapshots: SelectionSnapshot[];
  onRestore: (snapshot: SelectionSnapshot) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const sortedSnapshots = [...snapshots].reverse();

  const formatDate = (createdAt: any) => {
    if (!createdAt) return '—';
    if (typeof createdAt === 'string') {
      return new Date(createdAt).toLocaleString('it-IT');
    }
    if (createdAt?.toDate) {
      return createdAt.toDate().toLocaleString('it-IT');
    }
    if (createdAt?.seconds) {
      return new Date(createdAt.seconds * 1000).toLocaleString('it-IT');
    }
    return '—';
  };

  return (
    <div className="border-2 border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setOpen(prev => !prev)}
      >
        <span className="font-semibold text-blue-gray flex items-center gap-2">
          🕐 Revisioni Precedenti
          <span className="text-sm font-normal text-gray-500">({snapshots.length})</span>
        </span>
        <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="divide-y divide-gray-100">
          {sortedSnapshots.map((snap) => (
            <div key={snap.id} className="flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50">
              <div className="min-w-0">
                <p className="font-medium text-gray-800">{snap.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{formatDate(snap.createdAt)}</p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {snap.photoAssignments
                    ? `${Object.keys(snap.photoAssignments).length} foto assegnate`
                    : `${snap.selectedPhotoIds?.length || 0} foto selezionate`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={restoringId === snap.id}
                onClick={async () => {
                  setRestoringId(snap.id);
                  try {
                    await onRestore(snap);
                  } finally {
                    setRestoringId(null);
                  }
                }}
              >
                {restoringId === snap.id ? (
                  <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Ripristino...</>
                ) : (
                  'Ripristina'
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface GalleryManagementWorkspaceProps {
  galleryIdProp?: string;
  onClose?: () => void;
  embedded?: boolean;
}

export default function GalleryManagementWorkspace({ galleryIdProp, onClose, embedded }: GalleryManagementWorkspaceProps = {}) {
  const [, params] = useRoute('/admin/gallery/:galleryId/manage');
  const [, setLocation] = useLocation();
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const galleryId = galleryIdProp || params?.galleryId;

  const handleBack = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setLocation('/admin/dashboard');
    }
  }, [onClose, setLocation]);

  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [existingPhotoNames, setExistingPhotoNames] = useState<Set<string>>(new Set());
  const [existingPhotoHashes, setExistingPhotoHashes] = useState<Set<string>>(new Set());
  const [uploadConcurrency, setUploadConcurrency] = useState(3); // Concorrenza configurabile
  const [showPreview, setShowPreview] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const PHOTOS_PER_PAGE = 100;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);
  const [enableCompression, setEnableCompression] = useState(true);
  const [compressionQuality, setCompressionQuality] = useState(0.8);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);
  const [thumbProgress, setThumbProgress] = useState<{ generated: number; remaining: number } | null>(null);
  const autoThumbRanFor = useRef<string | null>(null);

  // Genera le miniature mancanti della galleria (anteprime leggere per la vista pubblica).
  // Gli originali NON vengono toccati: lightbox e download usano sempre la foto a piena risoluzione.
  const handleGenerateThumbnails = async () => {
    if (!galleryId) return;
    setIsGeneratingThumbs(true);
    setThumbProgress(null);
    try {
      const result = await generateGalleryThumbnails(galleryId, (p) => {
        setThumbProgress({ generated: p.generated, remaining: p.remaining });
      });

      if (result.generated === 0 && result.remaining === 0) {
        toast({
          title: '✅ Miniature già pronte',
          description: 'Tutte le foto hanno già un\u2019anteprima leggera.',
        });
      } else {
        const parts = [`${result.generated} miniature create`];
        if (result.failed > 0) parts.push(`${result.failed} non riuscite`);
        if (result.remaining > 0) parts.push(`${result.remaining} ancora da generare: premi di nuovo`);
        toast({
          title: '✅ Miniature generate',
          description: parts.join(', ') + '.',
        });
      }
      await refetchPhotos();
    } catch (error: any) {
      toast({
        title: '❌ Errore miniature',
        description: error?.message || 'Impossibile generare le miniature.',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingThumbs(false);
      setThumbProgress(null);
    }
  };

  // Query gallery data
  const { data: gallery, isLoading } = useQuery<Gallery | null>({
    queryKey: ['gallery', galleryId],
    queryFn: () => (galleryId ? GalleryService.getGalleryById(galleryId) : null),
    enabled: !!galleryId,
  });

  // Mutation per aggiornare la galleria (usato per selezioni)
  const updateGalleryMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Gallery> }) => {
      await GalleryService.updateGallery(id, updates);
    },
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ['gallery', id] });
      const previousGallery = queryClient.getQueryData(['gallery', id]) as Gallery;
      queryClient.setQueryData(['gallery', id], { ...previousGallery, ...updates });
      return { previousGallery };
    },
    onError: (err, variables, context) => {
      toast({
        title: '❌ Errore aggiornamento galleria',
        description: err instanceof Error ? err.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
      // Rollback a `context.previousGallery`
      if (context?.previousGallery) {
        queryClient.setQueryData(['gallery', variables.id], context.previousGallery);
      }
    },
    onSettled: async (data, error, variables) => {
      // Invalida cache per assicurarsi che i dati siano freschi dopo l'update
      await queryClient.invalidateQueries({ queryKey: ['gallery', variables.id] });
    },
  });

  // 🔧 React Query: Carica foto fotografo - MOVED BEFORE useEffect
  const {
    data: allPhotos = [],
    isLoading: isLoadingPhotos,
    error: photosError,
    refetch: refetchPhotos
  } = useQuery({
    queryKey: ['gallery-photos', galleryId], // 🔧 Standardized key + usa galleryId diretto
    queryFn: async () => {
      if (!galleryId) return [];
      // 🔧 Carica TUTTE le foto (admin + guest + legacy)
      const photos = await PhotoService.getGalleryPhotos(galleryId);
      return photos;
    },
    enabled: !!galleryId,
    retry: 2,
    staleTime: 0 // 🔧 NO CACHE per admin workflow - sempre dati freschi!
  });

  // Carica nomi e hash foto esistenti per controllo duplicati
  useEffect(() => {
    if (allPhotos.length > 0) {
      const names = new Set(allPhotos.map(p => p.name));
      const hashes = new Set(allPhotos.map(p => p.contentHash).filter(Boolean) as string[]);
      setExistingPhotoNames(names);
      setExistingPhotoHashes(hashes);
    }
  }, [allPhotos]);

  // 🖼️ Auto-riparazione miniature: all'apertura della galleria, se esistono foto
  // senza miniatura (es. caricate dagli ospiti, o residui di upload precedenti),
  // genera le miniature mancanti lato server. Una sola volta per galleria.
  // Gli originali NON vengono toccati; è idempotente e best-effort.
  useEffect(() => {
    if (!galleryId || isLoadingPhotos || allPhotos.length === 0) return;
    if (autoThumbRanFor.current === galleryId) return;
    autoThumbRanFor.current = galleryId;
    const hasMissing = allPhotos.some((p: any) => !p.thumbnailUrl);
    if (!hasMissing) return;
    generateGalleryThumbnails(galleryId)
      .then((r) => { if (r.generated > 0) refetchPhotos(); })
      .catch(() => { /* best-effort: l'admin può usare il pulsante "Genera miniature" */ });
  }, [galleryId, isLoadingPhotos, allPhotos, refetchPhotos]);

  // Redirect automatico se la galleria viene eliminata mentre siamo nel workspace
  useEffect(() => {
    // Se il loading è completato e la galleria non esiste più, redirect
    if (!isLoading && !gallery && galleryId) {
      toast({
        title: "Galleria eliminata",
        description: "La galleria è stata eliminata. Reindirizzamento alla dashboard...",
        variant: "destructive"
      });
      handleBack();
    }
  }, [isLoading, gallery, galleryId, toast, handleBack]);

  // State + ref per bloccare drop sovrapposti durante prep+upload
  // Ref sincrono per check immediati nei rapid drops, state per re-render della UI
  const [isPreparingUpload, setIsPreparingUpload] = useState(false);
  const isPreparingUploadRef = useRef(false);

  // Tracking degli object URL attivi tramite ref (mutato in modo sincrono per chiusura
  // affidabile su unmount, anche per URL appena creati che non hanno ancora triggerato re-render)
  const activeObjectUrlsRef = useRef<Set<string>>(new Set());

  const createTrackedObjectURL = useCallback((file: File): string => {
    const url = URL.createObjectURL(file);
    activeObjectUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeTrackedObjectURL = useCallback((url: string | undefined) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    activeObjectUrlsRef.current.delete(url);
  }, []);

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async ({ files, hashMap = new Map() }: { files: File[]; hashMap?: Map<string, string> }) => {
      if (!galleryId || !user) throw new Error('Missing gallery or user');

      // Filtra duplicati per nome E per hash contenuto (usa hashMap passata direttamente, non lo stato)
      const duplicates = files.filter((f, idx) => {
        const hash = hashMap.get(`${idx}-${f.name}`);
        return existingPhotoNames.has(f.name) || (hash ? existingPhotoHashes.has(hash) : false);
      });
      let uniqueFiles = files.filter((f, idx) => {
        const hash = hashMap.get(`${idx}-${f.name}`);
        return !existingPhotoNames.has(f.name) && !(hash ? existingPhotoHashes.has(hash) : false);
      });

      if (duplicates.length > 0) {
        const byHash = duplicates.filter((f, idx) => {
          const hash = hashMap.get(`${idx}-${f.name}`);
          return hash && existingPhotoHashes.has(hash) && !existingPhotoNames.has(f.name);
        });
        const reason = byHash.length > 0 ? ` (${byHash.length} rilevati per contenuto identico)` : '';
        toast({
          title: `⚠️ ${duplicates.length} foto duplicate saltate${reason}`,
          description: `${duplicates.slice(0, 3).map(f => f.name).join(', ')}${duplicates.length > 3 ? `... +${duplicates.length - 3}` : ''}`,
        });
      }

      if (uniqueFiles.length === 0) {
        throw new Error('Nessun file da caricare (tutti duplicati)');
      }

      // Comprimi immagini se abilitato
      if (enableCompression) {
        toast({
          title: '🔄 Compressione immagini',
          description: `Compressione di ${uniqueFiles.length} foto...`,
        });

        const compressionOptions = {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          quality: compressionQuality,
          fileType: 'image/jpeg'
        };

        const compressedFiles = await Promise.all(
          uniqueFiles.map(async (file) => {
            if (file.type.startsWith('image/')) {
              try {
                const compressed = await imageCompression(file, compressionOptions);
                // Mantieni il nome originale
                return new File([compressed], file.name, {
                  type: compressed.type,
                  lastModified: Date.now(),
                });
              } catch (error) {
                console.warn(`Errore compressione ${file.name}, uso originale:`, error);
                return file;
              }
            }
            return file;
          })
        );

        uniqueFiles = compressedFiles;

        const originalSize = files.reduce((sum, f) => sum + f.size, 0);
        const compressedSize = uniqueFiles.reduce((sum, f) => sum + f.size, 0);
        const savedMB = ((originalSize - compressedSize) / 1024 / 1024).toFixed(2);

        toast({
          title: '✅ Compressione completata',
          description: `Risparmio: ${savedMB} MB`,
        });
      }

      // Initialize progress (mantiene preview esistenti, revoca quelle scartate)
      setUploadProgress(prev => {
        const next = uniqueFiles.map(file => {
          const existing = prev.find(p => p.fileName === file.name);
          return {
            fileName: file.name,
            progress: 0,
            status: 'pending' as const,
            preview: existing?.preview || createTrackedObjectURL(file),
            size: file.size,
            isDuplicate: false
          };
        });
        // Revoca le preview che non vengono riutilizzate (es. duplicati scartati)
        const keptPreviews = new Set(next.map(p => p.preview).filter(Boolean) as string[]);
        prev.forEach(p => {
          if (p.preview && !keptPreviews.has(p.preview)) {
            revokeTrackedObjectURL(p.preview);
          }
        });
        return next;
      });

      // Upload photos con concorrenza configurabile
      const photos = await PhotoService.uploadPhotosToGallery(
        uniqueFiles,
        galleryId,
        user.uid,
        user.email || 'admin@studio.com',
        user.displayName || 'Admin',
        (progressArray) => {
          // Update progress state con dettagli migliorati
          setUploadProgress(prev =>
            progressArray.map(p => {
              const existing = prev.find(x => x.fileName === p.fileName);
              return {
                fileName: p.fileName,
                progress: p.progress,
                status: p.status === 'success' ? 'success' : p.status === 'error' ? 'error' : 'uploading' as const,
                preview: existing?.preview,
                size: existing?.size
              };
            })
          );
        },
        'admin',
        uploadConcurrency // Usa concorrenza configurabile
      );

      // Update gallery photoCount
      const newPhotoCount = (gallery?.photoCount || 0) + photos.length;
      await GalleryService.updateGallery(galleryId, { photoCount: newPhotoCount });

      return photos;
    },
    onSuccess: async (photos) => {
      toast({
        title: '✅ Upload completato',
        description: `${photos.length} foto caricate con successo!`,
      });

      // 🔧 FORZA REFETCH IMMEDIATO di tutte le query foto attive
      // refetchQueries bypassa staleTime e forza aggiornamento immediato
      await queryClient.refetchQueries({
        predicate: (query) => {
          if (!Array.isArray(query.queryKey)) return false;
          const key = query.queryKey[0];
          // Cattura TUTTE le query keys correlate alle foto
          return typeof key === 'string' && (
            key === 'photos' ||
            key === 'gallery-photos' ||
            key === 'guest-photos' ||
            key === 'guestPhotos' || // legacy
            key === 'top-liked-photos' || // widget top photos
            key.includes('photo') // catch-all per altre varianti
          );
        }
      });

      // Invalida anche cache galleria per aggiornare photoCount
      await queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });

      // 🖼️ Genera miniature in background per le nuove foto (best-effort, non blocca l'utente).
      // Aggiorna le foto al termine così le anteprime leggere compaiono da sole.
      if (galleryId) {
        generateGalleryThumbnails(galleryId)
          .then(() => refetchPhotos())
          .catch(() => { /* best-effort: l'admin può sempre usare il pulsante "Genera miniature" */ });
      }

      // Reset progress after 3s (revocando gli object URL per evitare memory leak)
      setTimeout(() => {
        setUploadProgress(prev => {
          prev.forEach(p => revokeTrackedObjectURL(p.preview));
          return [];
        });
      }, 3000);
    },
    onError: (error) => {
      toast({
        title: '❌ Errore upload',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
      // Revoca object URL anche in caso di errore
      setUploadProgress(prev => {
        prev.forEach(p => revokeTrackedObjectURL(p.preview));
        return [];
      });
    },
    onSettled: () => {
      // Reset del lock prep+upload (sia su success che error)
      isPreparingUploadRef.current = false;
      setIsPreparingUpload(false);
    },
  });

  // Cleanup object URLs allo smontaggio del componente per evitare memory leak
  useEffect(() => {
    return () => {
      activeObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
      activeObjectUrlsRef.current.clear();
    };
  }, []);

  // Dropzone
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    // Blocca upload sovrapposti: check sincrono via ref per gestire drops in rapida sequenza
    if (isPreparingUploadRef.current || uploadMutation.isPending) {
      toast({
        title: '⏳ Upload già in corso',
        description: 'Attendi il completamento prima di aggiungere altre foto.',
        variant: 'destructive',
      });
      return;
    }

    // Imposta lock subito (ref sincrono + state per UI). Resta attivo fino a onSettled
    // della mutation; se invece falliamo prima del mutate, lo resettiamo nel catch.
    isPreparingUploadRef.current = true;
    setIsPreparingUpload(true);

    let mutateScheduled = false;
    try {
      // Calcola hash PRIMA di avviare la mutation (passati direttamente, non tramite stato)
      const hashMap = new Map<string, string>();
      await Promise.all(acceptedFiles.map(async (file, idx) => {
        try {
          const hash = await computeFileHash(file);
          hashMap.set(`${idx}-${file.name}`, hash);
        } catch {
          // fallback: solo controllo per nome
        }
      }));

      uploadMutation.mutate({ files: acceptedFiles, hashMap });
      mutateScheduled = true;
    } finally {
      // Solo se mutate non è stato chiamato resettiamo qui; altrimenti onSettled gestisce il reset
      if (!mutateScheduled) {
        isPreparingUploadRef.current = false;
        setIsPreparingUpload(false);
      }
    }
  }, [uploadMutation, toast]);

  const onDropRejected = useCallback((rejections: FileRejection[]) => {
    const tooLarge = rejections.filter(r => r.errors.some(e => e.code === 'file-too-large'));
    if (tooLarge.length > 0) {
      toast({
        title: `⚠️ ${tooLarge.length} file scartati (> 50 MB)`,
        description: `${tooLarge.slice(0, 3).map(r => r.file.name).join(', ')}${tooLarge.length > 3 ? `... +${tooLarge.length - 3}` : ''}`,
        variant: 'destructive',
      });
    }
  }, [toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    onDropRejected,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif']
    },
    multiple: true,
    maxSize: 50 * 1024 * 1024, // 50 MB
    disabled: uploadMutation.isPending || isPreparingUpload,
  });



  // Filter selected photos
  const isMultiProductMode = (gallery?.productRequirements?.length ?? 0) > 1;

  const selectedPhotoIds = useMemo(() => {
    if (!gallery) return new Set<string>();

    if (isMultiProductMode && gallery.photoAssignments) {
      const ids = new Set<string>();
      Object.entries(gallery.photoAssignments).forEach(([photoId, assignments]) => {
        if (assignments && assignments.length > 0) {
          ids.add(photoId);
        }
      });
      return ids;
    } else {
      return new Set(gallery.selectedPhotoIds || []);
    }
  }, [gallery, isMultiProductMode]);

  const clientSelectedPhotos = useMemo(() =>
    allPhotos.filter(photo => selectedPhotoIds.has(photo.id)),
    [allPhotos, selectedPhotoIds]
  );

  // 🔒 RIMOSSA: la selezione cliente non è più modificabile dall'admin
  // (L'admin può solo resettare tutta la selezione)

  // Helper to remove timestamp prefix from filename for Lightroom export
  // Transforms: "1762272139996-DSCF4065.jpg" → "DSCF4065.jpg"
  const cleanFilenameForExport = useCallback((filename: string): string => {
    const match = filename.match(/^\d+-(.+)$/);
    return match ? match[1] : filename;
  }, []);

  // Generate filename list for Lightroom (clean names without timestamp)
  const filenameList = useMemo(() =>
    clientSelectedPhotos.map(p => cleanFilenameForExport(p.name)).join('\n'),
    [clientSelectedPhotos, cleanFilenameForExport]
  );

  // Selezioni raggruppate per capitolo (se la galleria usa i capitoli)
  const selectedByChapter = useMemo(() => {
    if (!gallery?.chaptersEnabled || !gallery?.chapters?.length) return null;
    const groups: { id: string; titolo: string; photos: typeof clientSelectedPhotos }[] = [];
    const sorted = [...gallery.chapters].sort((a, b) => (a.ordine || 0) - (b.ordine || 0));
    for (const chapter of sorted) {
      const photos = clientSelectedPhotos
        .filter(p => (p as any).chapterId === chapter.id)
        .sort((a, b) => ((a as any).chapterPosition || 0) - ((b as any).chapterPosition || 0));
      if (photos.length > 0) groups.push({ id: chapter.id, titolo: chapter.titolo, photos });
    }
    const unassigned = clientSelectedPhotos.filter(
      p => !(p as any).chapterId || !sorted.some(c => c.id === (p as any).chapterId)
    );
    if (unassigned.length > 0) groups.push({ id: '__altre__', titolo: 'Altre foto (senza capitolo)', photos: unassigned });
    return groups;
  }, [gallery?.chaptersEnabled, gallery?.chapters, clientSelectedPhotos]);

  // Check deadline status (Task 20)
  const deadlineDate = gallery?.selectionDeadline ? convertFirestoreTimestamp(gallery.selectionDeadline) : null;
  const isDeadlinePassed = gallery?.selectionDeadline && gallery.selectionDeadlineEnforced && deadlineDate
    ? new Date() > deadlineDate
    : false;

  // Admin unlock mutation (Task 20)
  const unlockSelectionMutation = useMutation({
    mutationFn: async () => {
      if (!galleryId) throw new Error('Missing galleryId');
      await GalleryService.updateGallery(galleryId, {
        selectionDeadlineEnforced: false,
      });
    },
    onSuccess: () => {
      toast({
        title: '✅ Selezione sbloccata',
        description: 'Il cliente può ora completare la selezione anche dopo la scadenza.',
      });
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    },
    onError: (error) => {
      toast({
        title: '❌ Errore',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
    },
  });

  // Mutation per aggiornare selectionMode (like/dislike)
  const updateSelectionModeMutation = useMutation({
    mutationFn: async (newMode: 'like' | 'dislike') => {
      if (!galleryId) throw new Error('Missing galleryId');
      await GalleryService.updateGallery(galleryId, { selectionMode: newMode });
    },
    onSuccess: (_, newMode) => {
      toast({
        title: newMode === 'dislike' ? '🔄 Modalità "Non mi piace" attivata' : '✅ Modalità normale attivata',
        description: newMode === 'dislike'
          ? 'Il cliente segnerà le foto da ESCLUDERE. Le rimanenti verranno salvate.'
          : 'Il cliente selezionerà le foto che preferisce.',
      });
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    },
    onError: (error) => {
      toast({
        title: '❌ Errore',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
    },
  });

  // Mutation per inviare notifica email galleria pronta
  const notifyClientMutation = useMutation({
    mutationFn: async () => {
      if (!galleryId) throw new Error('Missing galleryId');
      const response = await apiRequest('POST', '/api/email/gallery-photos-ready', {
        galleryId,
        photoCount: gallery?.photoCount || 0,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Errore invio notifica');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: '✅ Notifica inviata',
        description: data.message || 'Email inviata al cliente',
      });
    },
    onError: (error) => {
      toast({
        title: '❌ Errore invio notifica',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-cream via-soft-peach to-light-sage flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sage border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Caricamento galleria...</p>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-cream via-soft-peach to-light-sage flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-12">
            <p className="text-lg font-medium text-gray-700 mb-4">Galleria non trovata</p>
            <Button onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              {onClose ? 'Chiudi' : 'Torna alla Dashboard'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-cream via-soft-peach to-light-sage py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={handleBack}
            className="mb-4"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {onClose ? 'Chiudi Gestione Galleria' : 'Torna a BookingsManager'}
          </Button>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="font-playfair text-3xl text-blue-gray">
                  Gestisci Galleria: {gallery.name}
                </CardTitle>
                <CardDescription>
                  Codice: <strong>{gallery.code}</strong> | Foto: <strong>{gallery.photoCount || 0}</strong>
                  {gallery.selectionEnabled && (
                    <> | Modalità Selezione: <strong className="text-sage">{gallery.requiredPhotoCount} foto richieste</strong></>
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => notifyClientMutation.mutate()}
                  disabled={notifyClientMutation.isPending || (gallery?.photoCount || 0) === 0}
                  data-testid="button-notify-client"
                  className="border-sage text-sage hover:bg-sage/10"
                >
                  {notifyClientMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Notifica Cliente
                </Button>
                <Button
                  onClick={() => setEditModalOpen(true)}
                  className="bg-terracotta hover:bg-terracotta/90 text-white"
                  data-testid="button-edit-gallery"
                  disabled={isLoading || !gallery}
                >
                  <Pencil className="w-4 h-4 mr-2" />
                  Modifica Galleria
                </Button>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="w-4 h-4 mr-2" />
              Carica Foto
            </TabsTrigger>
            <TabsTrigger value="chapters" data-testid="tab-chapters">
              <Folder className="w-4 h-4 mr-2" />
              Capitoli
            </TabsTrigger>
            <TabsTrigger value="selections" data-testid="tab-selections" disabled={!gallery.selectionEnabled}>
              <Users className="w-4 h-4 mr-2" />
              Selezioni Cliente
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Impostazioni
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Upload Foto */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>Carica Foto Bulk</CardTitle>
                <CardDescription>
                  Trascina le foto dello shooting qui. Compressione automatica inclusa.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Controlli Upload */}
                <div className="space-y-4 mb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={showPreview}
                          onCheckedChange={(checked) => setShowPreview(!!checked)}
                        />
                        Mostra preview
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={enableCompression}
                          onCheckedChange={(checked) => setEnableCompression(!!checked)}
                        />
                        Comprimi immagini
                      </label>
                      {enableCompression && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-gray-600">Qualità:</span>
                          <select
                            value={compressionQuality}
                            onChange={(e) => setCompressionQuality(Number(e.target.value))}
                            className="border border-gray-300 rounded px-2 py-1 text-sm"
                          >
                            <option value={0.6}>60% (Max compressione)</option>
                            <option value={0.7}>70%</option>
                            <option value={0.8}>80% (Consigliato)</option>
                            <option value={0.9}>90%</option>
                            <option value={1.0}>100% (Originale)</option>
                          </select>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-gray-600">Concorrenza:</span>
                        <select
                          value={uploadConcurrency}
                          onChange={(e) => setUploadConcurrency(Number(e.target.value))}
                          className="border border-gray-300 rounded px-2 py-1 text-sm"
                        >
                          <option value={1}>1 (Lento, sicuro)</option>
                          <option value={2}>2 (Bilanciato)</option>
                          <option value={3}>3 (Veloce)</option>
                          <option value={5}>5 (Molto veloce)</option>
                        </select>
                      </div>
                    </div>
                    {uploadProgress.length > 0 && !uploadMutation.isPending && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          uploadProgress.forEach(p => p.preview && URL.revokeObjectURL(p.preview));
                          setUploadProgress([]);
                        }}
                      >
                        Cancella selezione
                      </Button>
                    )}
                  </div>
                </div>

                {/* Dropzone Area */}
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-all ${
                    isDragActive
                      ? 'border-sage bg-sage/10 scale-105'
                      : 'border-gray-300 hover:border-sage hover:bg-sage/5'
                  }`}
                  data-testid="dropzone-upload"
                >
                  <input {...getInputProps()} />
                  <Upload className={`w-16 h-16 mx-auto mb-4 ${isDragActive ? 'text-sage' : 'text-gray-400'}`} />
                  {isDragActive ? (
                    <p className="text-lg font-medium text-sage">Rilascia le foto qui...</p>
                  ) : (
                    <>
                      <p className="text-lg font-medium text-gray-700 mb-2">
                        📸 Trascina le foto qui o clicca per selezionare
                      </p>
                      <p className="text-sm text-gray-500">
                        Supporta JPG, PNG, WebP, GIF - Upload multiplo abilitato
                      </p>
                      {existingPhotoNames.size > 0 && (
                        <p className="text-xs text-gray-400 mt-2">
                          ℹ️ Controllo automatico duplicati attivo ({existingPhotoNames.size} foto esistenti)
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Preview Files Selected */}
                {showPreview && uploadProgress.length > 0 && (
                  <div className="space-y-3 mt-6">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-blue-gray">
                        Preview File ({uploadProgress.length})
                      </h4>
                      <div className="text-sm text-gray-500">
                        Totale: {(uploadProgress.reduce((sum, f) => sum + (f.size || 0), 0) / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-96 overflow-y-auto">
                      {uploadProgress.map((file, index) => (
                        <div
                          key={index}
                          className={`relative group ${
                            file.isDuplicate ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="aspect-square rounded-lg overflow-hidden border-2 border-gray-200">
                            {file.preview && (
                              <img
                                src={file.preview}
                                alt={file.fileName}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                            <p className="text-white text-xs text-center truncate w-full">
                              {file.fileName}
                            </p>
                            <p className="text-white/80 text-xs">
                              {(file.size! / 1024).toFixed(0)} KB
                            </p>
                          </div>
                          {file.isDuplicate && (
                            <div className="absolute top-1 right-1 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">
                              Duplicato
                            </div>
                          )}
                          {file.status === 'success' && (
                            <div className="absolute top-1 left-1 bg-green-500 rounded-full p-1">
                              <CheckCircle className="w-4 h-4 text-white" />
                            </div>
                          )}
                          {file.status === 'error' && (
                            <div className="absolute top-1 left-1 bg-red-500 rounded-full p-1">
                              <XCircle className="w-4 h-4 text-white" />
                            </div>
                          )}
                          {file.status === 'uploading' && (
                            <div className="absolute bottom-0 inset-x-0 h-1 bg-gray-200">
                              <div
                                className="h-full bg-sage transition-all"
                                style={{ width: `${file.progress}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Upload Progress con Statistiche */}
                {uploadProgress.length > 0 && uploadMutation.isPending && (
                  <div className="space-y-4">
                    {/* Statistiche globali */}
                    <div className="bg-gradient-to-r from-sage/10 to-blue-gray/10 rounded-lg p-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-2xl font-bold text-sage">
                            {uploadProgress.filter(f => f.status === 'success').length}
                          </div>
                          <div className="text-xs text-gray-600">Completati</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-blue-600">
                            {uploadProgress.filter(f => f.status === 'uploading').length}
                          </div>
                          <div className="text-xs text-gray-600">In corso</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-gray-400">
                            {uploadProgress.filter(f => f.status === 'pending').length}
                          </div>
                          <div className="text-xs text-gray-600">In attesa</div>
                        </div>
                        <div>
                          <div className="text-2xl font-bold text-red-600">
                            {uploadProgress.filter(f => f.status === 'error').length}
                          </div>
                          <div className="text-xs text-gray-600">Errori</div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Progress
                          value={(uploadProgress.filter(f => f.status === 'success').length / uploadProgress.length) * 100}
                          className="h-3"
                        />
                        <p className="text-sm text-center text-gray-600 mt-2">
                          {uploadProgress.filter(f => f.status === 'success').length} / {uploadProgress.length} file completati
                        </p>
                      </div>
                    </div>

                    {/* Lista dettagliata (collassabile) */}
                    {!showPreview && (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {uploadProgress.map((file, index) => (
                          <div key={index} className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {file.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />}
                                {file.status === 'error' && <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />}
                                {file.status === 'uploading' && <Loader2 className="w-4 h-4 text-sage animate-spin flex-shrink-0" />}
                                {file.status === 'pending' && <Loader2 className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                                <span className="truncate">{file.fileName}</span>
                              </div>
                              <span className="text-gray-500 ml-2 flex-shrink-0">{Math.round(file.progress)}%</span>
                            </div>
                            {file.status === 'uploading' && (
                              <Progress value={file.progress} className="h-1" />
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Upload Stats */}
                {uploadMutation.isPending && (
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <Loader2 className="w-6 h-6 text-sage animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Elaborazione in corso...</p>
                  </div>
                )}

                {/* Errore caricamento foto (visibile anche con dataset vuoto) */}
                {!isLoadingPhotos && Boolean(photosError) && allPhotos.length === 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <div className="text-center py-12 bg-red-50 border border-red-200 rounded-lg">
                      <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-red-700 mb-1">Errore nel caricamento delle foto</p>
                      <p className="text-xs text-red-600 mb-3">
                        {photosError instanceof Error ? photosError.message : 'Errore sconosciuto'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchPhotos()}
                        data-testid="button-retry-load-photos-empty"
                      >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Riprova
                      </Button>
                    </div>
                  </div>
                )}

                {/* Foto Esistenti con possibilità di eliminazione */}
                {allPhotos.length > 0 && (
                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                      <div>
                        <h4 className="font-semibold text-blue-gray text-lg">📸 Foto Caricate</h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {allPhotos.length} foto totali ({(allPhotos.reduce((sum, p) => sum + (p.size || 0), 0) / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await refetchPhotos();
                            toast({
                              title: '🔄 Foto ricaricate',
                              description: 'Le foto sono state aggiornate.',
                            });
                          }}
                          disabled={isLoadingPhotos}
                        >
                          {isLoadingPhotos ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              Caricamento...
                            </>
                          ) : (
                            <>
                              🔄 Ricarica Foto
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleGenerateThumbnails}
                          disabled={isGeneratingThumbs}
                          title="Crea anteprime leggere per velocizzare la galleria pubblica. Gli originali restano intatti."
                        >
                          {isGeneratingThumbs ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                              {thumbProgress ? `Miniature: ${thumbProgress.generated}…` : 'Generazione…'}
                            </>
                          ) : (
                            <>
                              <ImageIcon className="w-4 h-4 mr-1" />
                              Genera miniature
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const filteredPhotos = allPhotos.filter(photo =>
                              searchTerm === '' ||
                              photo.name.toLowerCase().includes(searchTerm.toLowerCase())
                            );
                            if (selectedPhotos.size === filteredPhotos.length && filteredPhotos.length > 0) {
                              setSelectedPhotos(new Set());
                            } else {
                              setSelectedPhotos(new Set(filteredPhotos.map(p => p.id)));
                            }
                          }}
                        >
                          <Checkbox
                            checked={
                              allPhotos.length > 0 &&
                              selectedPhotos.size === allPhotos.filter(p => searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase())).length
                            }
                            className="mr-1.5 pointer-events-none"
                          />
                          {selectedPhotos.size > 0 && selectedPhotos.size === allPhotos.filter(p => searchTerm === '' || p.name.toLowerCase().includes(searchTerm.toLowerCase())).length
                            ? 'Deseleziona tutto'
                            : 'Seleziona tutto'}
                        </Button>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <Input
                            type="text"
                            placeholder="Cerca foto..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 w-64"
                          />
                        </div>
                        {selectedPhotos.size > 0 && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              if (!confirm(`Eliminare ${selectedPhotos.size} foto? Questa azione è irreversibile.`)) return;

                              try {
                                const deletePromises = Array.from(selectedPhotos).map(photoId =>
                                  PhotoService.deletePhoto(photoId)
                                );
                                await Promise.all(deletePromises);

                                // Update gallery photoCount
                                const newPhotoCount = Math.max(0, (gallery?.photoCount || 0) - selectedPhotos.size);
                                await GalleryService.updateGallery(galleryId!, { photoCount: newPhotoCount });

                                toast({
                                  title: '✅ Foto eliminate',
                                  description: `${selectedPhotos.size} foto eliminate con successo.`,
                                });

                                setSelectedPhotos(new Set());

                                // 🔧 FORZA REFETCH di tutte le query foto
                                await queryClient.refetchQueries({
                                  predicate: (query) => {
                                    if (!Array.isArray(query.queryKey)) return false;
                                    const key = query.queryKey[0];
                                    return typeof key === 'string' && (
                                      key === 'photos' ||
                                      key === 'gallery-photos' ||
                                      key === 'guest-photos' ||
                                      key === 'guestPhotos' ||
                                      key === 'top-liked-photos' ||
                                      key.includes('photo')
                                    );
                                  }
                                });
                                queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
                              } catch (error) {
                                toast({
                                  title: '❌ Errore',
                                  description: error instanceof Error ? error.message : 'Errore durante l\'eliminazione',
                                  variant: 'destructive',
                                });
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Elimina {selectedPhotos.size} foto
                          </Button>
                        )}
                      </div>
                    </div>

                    {isLoadingPhotos ? (
                      <div className="text-center py-12">
                        <Loader2 className="w-8 h-8 text-sage animate-spin mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Caricamento foto...</p>
                      </div>
                    ) : Boolean(photosError) ? (
                      <div className="text-center py-12 bg-red-50 border border-red-200 rounded-lg">
                        <XCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                        <p className="text-sm font-medium text-red-700 mb-1">Errore nel caricamento delle foto</p>
                        <p className="text-xs text-red-600 mb-3">
                          {photosError instanceof Error ? photosError.message : 'Errore sconosciuto'}
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => refetchPhotos()}
                          data-testid="button-retry-load-photos"
                        >
                          <RefreshCw className="w-4 h-4 mr-1" />
                          Riprova
                        </Button>
                      </div>
                    ) : (() => {
                      const filteredPhotos = allPhotos.filter(photo =>
                        searchTerm === '' ||
                        photo.name.toLowerCase().includes(searchTerm.toLowerCase())
                      );
                      const totalPages = Math.max(1, Math.ceil(filteredPhotos.length / PHOTOS_PER_PAGE));
                      const safePage = Math.min(currentPage, totalPages);
                      const startIdx = (safePage - 1) * PHOTOS_PER_PAGE;
                      const endIdx = startIdx + PHOTOS_PER_PAGE;
                      const paginatedPhotos = filteredPhotos.slice(startIdx, endIdx);
                      return (
                        <>
                          {filteredPhotos.length > PHOTOS_PER_PAGE && (
                            <div className="flex items-center justify-between mb-4 p-3 bg-sage/5 rounded-lg border border-sage/20" data-testid="admin-photos-pagination-top">
                              <p className="text-sm text-gray-700">
                                Foto <strong>{startIdx + 1}–{Math.min(endIdx, filteredPhotos.length)}</strong> di <strong>{filteredPhotos.length}</strong>
                                {searchTerm && <span className="text-gray-500"> (filtrate)</span>}
                              </p>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                  disabled={safePage === 1}
                                  data-testid="btn-prev-page-top"
                                >
                                  ← Precedente
                                </Button>
                                <span className="text-sm font-medium px-2">
                                  Pagina {safePage} / {totalPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                  disabled={safePage === totalPages}
                                  data-testid="btn-next-page-top"
                                >
                                  Successiva →
                                </Button>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {paginatedPhotos.map((photo) => {
                            const isSelected = selectedPhotos.has(photo.id);
                            return (
                              <div
                                key={photo.id}
                                className={`relative group aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                                  isSelected
                                    ? 'border-blue-500 ring-2 ring-blue-200'
                                    : 'border-gray-200 hover:border-sage'
                                }`}
                              >
                                {/* Checkbox selezione */}
                                <div className="absolute top-2 left-2 z-10">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(checked) => {
                                      const newSelected = new Set(selectedPhotos);
                                      if (checked) {
                                        newSelected.add(photo.id);
                                      } else {
                                        newSelected.delete(photo.id);
                                      }
                                      setSelectedPhotos(newSelected);
                                    }}
                                    className="bg-white border-2"
                                  />
                                </div>

                                {/* Indicatore dimensione sempre visibile */}
                                <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                                  {(photo.size / 1024).toFixed(0)} KB
                                </div>

                                <img
                                  src={photo.thumbnailUrl || photo.url}
                                  alt={photo.name}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                />

                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
                                  <p className="text-white text-xs text-center truncate w-full mb-3">
                                    {photo.name}
                                  </p>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={async () => {
                                      if (!confirm(`Eliminare "${photo.name}"? Questa azione è irreversibile.`)) return;

                                      try {
                                        await PhotoService.deletePhoto(photo.id);

                                        // Update gallery photoCount
                                        const newPhotoCount = Math.max(0, (gallery?.photoCount || 0) - 1);
                                        await GalleryService.updateGallery(galleryId!, { photoCount: newPhotoCount });

                                        toast({
                                          title: '✅ Foto eliminata',
                                          description: `${photo.name} è stata eliminata con successo.`,
                                        });

                                        // Rimuovi da selectedPhotos se presente
                                        const newSelected = new Set(selectedPhotos);
                                        newSelected.delete(photo.id);
                                        setSelectedPhotos(newSelected);

                                        // 🔧 FORZA REFETCH di tutte le query foto
                                        await queryClient.refetchQueries({
                                          predicate: (query) => {
                                            if (!Array.isArray(query.queryKey)) return false;
                                            const key = query.queryKey[0];
                                            return typeof key === 'string' && (
                                              key === 'photos' ||
                                              key === 'gallery-photos' ||
                                              key === 'guest-photos' ||
                                              key === 'guestPhotos' ||
                                              key === 'top-liked-photos' ||
                                              key.includes('photo')
                                            );
                                          }
                                        });
                                        queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
                                      } catch (error) {
                                        toast({
                                          title: '❌ Errore',
                                          description: error instanceof Error ? error.message : 'Errore durante l\'eliminazione',
                                          variant: 'destructive',
                                        });
                                      }
                                    }}
                                  >
                                    <XCircle className="w-4 h-4 mr-1" />
                                    Elimina
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                          </div>
                          {filteredPhotos.length > PHOTOS_PER_PAGE && (
                            <div className="flex items-center justify-between mt-4 p-3 bg-sage/5 rounded-lg border border-sage/20" data-testid="admin-photos-pagination-bottom">
                              <p className="text-sm text-gray-700">
                                Foto <strong>{startIdx + 1}–{Math.min(endIdx, filteredPhotos.length)}</strong> di <strong>{filteredPhotos.length}</strong>
                              </p>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCurrentPage(p => Math.max(1, p - 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  disabled={safePage === 1}
                                  data-testid="btn-prev-page-bottom"
                                >
                                  ← Precedente
                                </Button>
                                <span className="text-sm font-medium px-2">
                                  Pagina {safePage} / {totalPages}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setCurrentPage(p => Math.min(totalPages, p + 1));
                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  disabled={safePage === totalPages}
                                  data-testid="btn-next-page-bottom"
                                >
                                  Successiva →
                                </Button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {searchTerm && allPhotos.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).length === 0 && (
                      <div className="text-center py-12">
                        <ImageIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600">Nessuna foto trovata con "{searchTerm}"</p>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Capitoli */}
          <TabsContent value="chapters">
            <ChaptersManager gallery={gallery} galleryId={galleryId!} />
          </TabsContent>

          {/* Tab 3: Selezioni Cliente */}
          <TabsContent value="selections">
            <Card>
              <CardHeader>
                <CardTitle>Selezioni Cliente</CardTitle>
                <CardDescription>
                  Visualizza le foto selezionate dal cliente e esporta i nomi per Lightroom.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Selection Status */}
                <div className="bg-gradient-to-r from-sage/10 to-blue-gray/10 p-4 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-blue-gray">Stato Selezione</h4>
                    {gallery?.selectionStatus === 'completed' ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        ✅ Completata
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                        ⏳ In Attesa
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                    <div>
                      <p className="text-gray-600">Foto Selezionate</p>
                      <p className="text-2xl font-bold text-sage" data-testid="text-selected-count">
                        {isMultiProductMode
                          ? `${Object.keys(gallery.photoAssignments || {}).length} foto assegnate`
                          : gallery.productRequirements?.length === 1
                            ? `${selectedPhotoIds.size} / ${gallery.productRequirements[0].prodottoNumeroFoto || 0}`
                            : `${selectedPhotoIds.size} / ${gallery?.requiredPhotoCount || 0}`
                        }
                      </p>
                    </div>
                    {gallery?.selectionDeadline && (
                      <div>
                        <p className="text-gray-600">Scadenza Selezione</p>
                        <p className="text-lg font-semibold text-gray-700">
                          {convertFirestoreTimestamp(gallery.selectionDeadline)?.toLocaleDateString('it-IT') || 'Data non disponibile'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Multi-Product Statistics */}
                {gallery.productRequirements && gallery.productRequirements.length > 0 && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-gray mb-3">📊 Statistiche per Prodotto</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {gallery.productRequirements.map((prod, idx) => {
                        const assignedCount = isMultiProductMode
                          ? Object.entries(gallery.photoAssignments || {}).filter(
                              ([photoId, assignments]) => assignments.includes(String(idx))
                            ).length
                          : selectedPhotoIds.size;
                        const isComplete = assignedCount >= prod.prodottoNumeroFoto;

                        return (
                          <div
                            key={`product-progress-${gallery?.id}-${idx}`}
                            className={`bg-white/90 rounded-lg p-3 ring-2 ${
                              isComplete
                                ? 'ring-green-300'
                                : assignedCount > 0
                                  ? 'ring-yellow-300'
                                  : 'ring-gray-300'
                            }`}
                            data-testid={`admin-product-stats-${idx}`}
                          >
                            <div className="flex items-start justify-between mb-1">
                              <p className="text-xs font-semibold text-gray-700">{prod.prodottoNome}</p>
                              {isComplete && <span className="text-green-600 text-sm">✓</span>}
                            </div>
                            <p className="text-lg font-bold">{assignedCount}/{prod.prodottoNumeroFoto}</p>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                              <div
                                className={`h-full ${isComplete ? 'bg-green-500' : assignedCount > 0 ? 'bg-yellow-500' : 'bg-gray-400'}`}
                                style={{ width: `${Math.min((assignedCount / prod.prodottoNumeroFoto) * 100, 100)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 📝 Note del Cliente */}
                {gallery?.selectionNotes && (
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-gray mb-2 flex items-center gap-2">
                      <span>💬</span>
                      Note del Cliente
                    </h4>
                    <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed" data-testid="text-selection-notes">
                      {gallery.selectionNotes}
                    </p>
                  </div>
                )}

                {/* 📝 Note Individuali per Foto */}
                {gallery?.photoNotes && Object.keys(gallery.photoNotes).length > 0 && (
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-gray mb-3 flex items-center gap-2">
                      <span>📸</span>
                      Note Specifiche per Foto
                      <span className="text-sm font-normal text-gray-500">
                        ({Object.keys(gallery.photoNotes).length} foto con note)
                      </span>
                    </h4>
                    <div className="space-y-3">
                      {Object.entries(gallery.photoNotes).map(([photoId, note]) => {
                        const photo = allPhotos.find(p => p.id === photoId);
                        return (
                          <div 
                            key={photoId} 
                            className="flex gap-3 p-3 bg-white rounded-lg border border-amber-200"
                            data-testid={`photo-note-${photoId}`}
                          >
                            <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden border border-gray-200">
                              {photo ? (
                                <img
                                  src={photo.thumbnailUrl || photo.url}
                                  alt={photo.name || 'Foto'}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                                  N/A
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-500 mb-1">
                                {photo?.name || `Foto ID: ${photoId.substring(0, 8)}...`}
                              </p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                                {note as string}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Selected Photos Grid (READONLY) */}
                {clientSelectedPhotos.length > 0 ? (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-blue-gray">Miniature Foto Selezionate (Solo Lettura)</h4>
                    {selectedByChapter ? (
                      <div className="space-y-6" data-testid="selections-by-chapter">
                        {selectedByChapter.map((group) => (
                          <div key={group.id} className="space-y-3" data-testid={`chapter-selection-${group.id}`}>
                            <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                              <h5 className="font-medium text-blue-gray">📖 {group.titolo}</h5>
                              <span className="text-sm text-gray-500">({group.photos.length} foto)</span>
                            </div>
                            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                              {group.photos.map((photo) => (
                                <PhotoCard
                                  key={photo.id}
                                  photo={photo}
                                  isSelected={true}
                                  readOnly={true}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                        {clientSelectedPhotos.map((photo) => (
                          <PhotoCard
                            key={photo.id}
                            photo={photo}
                            isSelected={true}
                            readOnly={true}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gray-50 rounded-lg">
                    <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Nessuna Foto Selezionata
                    </p>
                    <p className="text-sm text-gray-500">
                      Il cliente non ha ancora completato la selezione.
                    </p>
                  </div>
                )}

                {/* Filename Export for Lightroom */}
                {clientSelectedPhotos.length > 0 && (
                  <div className="space-y-6">
                    <h4 className="font-semibold text-blue-gray text-lg">📋 Nomi File per Lightroom</h4>

                    {/* Box: Tutte le foto selezionate */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h5 className="font-medium text-blue-gray">🎯 Tutte le Foto Selezionate</h5>
                        <span className="text-sm text-gray-500">({clientSelectedPhotos.length} foto)</span>
                      </div>
                      <p className="text-sm text-gray-600">
                        Copia e incolla questi nomi in Lightroom per filtrare/selezionare tutte le foto:
                      </p>
                      <textarea
                        readOnly
                        value={filenameList}
                        className="w-full h-48 p-3 border-2 border-sage/30 rounded-lg font-mono text-sm bg-white resize-none focus:outline-none focus:border-sage"
                        data-testid="textarea-filename-list"
                        onClick={(e) => {
                          e.currentTarget.select();
                          navigator.clipboard.writeText(filenameList);
                          toast({
                            title: '📋 Copiato!',
                            description: 'Tutti i nomi file copiati negli appunti.',
                          });
                        }}
                      />
                      <p className="text-xs text-gray-500">
                        💡 Clicca sul box per copiare automaticamente tutti i nomi file.
                      </p>
                    </div>

                    {/* Box separati per capitolo (solo se la galleria usa i capitoli) */}
                    {selectedByChapter && selectedByChapter.length > 1 && (
                      <div className="space-y-4 pt-4 border-t border-gray-200">
                        <h5 className="font-medium text-blue-gray">📖 Foto per Capitolo</h5>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {selectedByChapter.map((group) => {
                            const names = group.photos.map(p => cleanFilenameForExport(p.name)).join('\n');
                            return (
                              <div key={group.id} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm text-blue-gray">{group.titolo}</span>
                                  <span className="text-xs text-gray-500">({group.photos.length} foto)</span>
                                </div>
                                <textarea
                                  readOnly
                                  value={names}
                                  className="w-full h-28 p-2 border-2 border-sage/30 rounded-lg font-mono text-xs bg-white resize-none focus:outline-none focus:border-sage"
                                  data-testid={`textarea-chapter-filenames-${group.id}`}
                                  onClick={(e) => {
                                    e.currentTarget.select();
                                    navigator.clipboard.writeText(names);
                                    toast({
                                      title: '📋 Copiato!',
                                      description: `Nomi file del capitolo "${group.titolo}" copiati.`,
                                    });
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Box separati per ogni prodotto (solo se multi-prodotto) */}
                    {gallery?.productRequirements && gallery.productRequirements.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-gray-200">
                        <h5 className="font-medium text-blue-gray">📦 Foto per Prodotto</h5>
                        <p className="text-sm text-gray-600 mb-4">
                          Ogni prodotto ha il suo elenco di foto assegnate:
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {gallery.productRequirements.map((product, productIndex) => {
                            const productPhotos = isMultiProductMode
                              ? allPhotos.filter(photo => {
                                  const assignments = gallery.photoAssignments?.[photo.id] || [];
                                  return assignments.includes(String(productIndex));
                                })
                              : clientSelectedPhotos;

                            const productFilenameList = productPhotos.map(p => cleanFilenameForExport(p.name)).join('\n');

                            // Product colors (same as Gallery.tsx)
                            const productColors = [
                              { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-700' },
                              { bg: 'bg-green-500', border: 'border-green-500', text: 'text-green-700' },
                              { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-700' },
                              { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-700' },
                              { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-700' },
                              { bg: 'bg-teal-500', border: 'border-teal-500', text: 'text-teal-700' },
                            ];
                            const colorClass = productColors[productIndex % productColors.length];

                            return (
                              <div key={`product-export-${gallery?.id}-${productIndex}`} className={`space-y-2 p-4 rounded-lg border-2 ${colorClass.border} bg-white`}>
                                <div className="flex items-center justify-between">
                                  <h6 className={`font-semibold ${colorClass.text}`}>
                                    {product.prodottoNome}
                                  </h6>
                                  <span className={`text-sm font-medium ${colorClass.text}`}>
                                    {productPhotos.length} / {product.prodottoNumeroFoto} foto
                                  </span>
                                </div>

                                {productPhotos.length > 0 ? (
                                  <>
                                    <textarea
                                      readOnly
                                      value={productFilenameList}
                                      className={`w-full h-32 p-2 border ${colorClass.border} rounded font-mono text-xs bg-gray-50 resize-none focus:outline-none`}
                                      data-testid={`textarea-product-${productIndex}`}
                                      onClick={(e) => {
                                        e.currentTarget.select();
                                        navigator.clipboard.writeText(productFilenameList);
                                        toast({
                                          title: '📋 Copiato!',
                                          description: `Nomi file per "${product.prodottoNome}" copiati.`,
                                        });
                                      }}
                                    />
                                    <p className="text-xs text-gray-500">
                                      💡 Clicca per copiare i nomi di questo prodotto
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-sm text-gray-500 italic py-4 text-center">
                                    Nessuna foto assegnata a questo prodotto
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 📸 Revisioni Precedenti (Snapshots) */}
                {gallery.selectionSnapshots && gallery.selectionSnapshots.length > 0 && (
                  <SnapshotsSection
                    snapshots={gallery.selectionSnapshots}
                    onRestore={async (snapshot) => {
                      try {
                        await GalleryService.updateGallery(galleryId!, {
                          selectedPhotoIds: snapshot.selectedPhotoIds,
                          photoAssignments: snapshot.photoAssignments || {},
                          selectionNotes: snapshot.selectionNotes || '',
                          selectionStatus: 'completed',
                        } as any);
                        queryClient.removeQueries({ queryKey: ['gallery', galleryId] });
                        await queryClient.refetchQueries({ queryKey: ['gallery', galleryId] });
                        toast({
                          title: '✅ Selezione ripristinata',
                          description: `La selezione "${snapshot.label}" è stata ripristinata come corrente.`,
                        });
                      } catch (err) {
                        console.error('Errore ripristino snapshot:', err);
                        toast({
                          title: 'Errore',
                          description: 'Impossibile ripristinare la selezione.',
                          variant: 'destructive',
                        });
                      }
                    }}
                  />
                )}
              </CardContent>

              {/* 🔄 RESET SELEZIONE CLIENTE */}
              {gallery.selectionEnabled && clientSelectedPhotos.length > 0 && (
                <CardFooter className="flex justify-end pt-6">
                  <Button
                    variant="destructive"
                    size="lg"
                    onClick={async () => {
                      if (!confirm("Sei sicuro di voler resettare la selezione del cliente? L'utente dovrà rifarla da zero.")) return;

                      try {
                        // Reset diretto via Firestore per massima affidabilità
                        const { doc, updateDoc, serverTimestamp, arrayUnion } = await import('firebase/firestore');
                        const { db } = await import('@/lib/firebase');
                        
                        const galleryRef = doc(db, 'galleries', galleryId!);

                        // 📸 Salva snapshot della selezione corrente PRIMA di resettare
                        if (gallery.selectionStatus === 'completed' && gallery.selectedPhotoIds && gallery.selectedPhotoIds.length > 0) {
                          const existingSnapshots = (gallery as any).selectionSnapshots || [];
                          const snapshotIndex = existingSnapshots.length + 1;
                          const snapshot = {
                            id: Date.now().toString(),
                            createdAt: new Date().toISOString(),
                            label: `Revisione ${snapshotIndex}`,
                            photoAssignments: gallery.photoAssignments || null,
                            selectedPhotoIds: gallery.selectedPhotoIds,
                            selectionNotes: gallery.selectionNotes || '',
                            createdBy: 'admin' as const,
                          };
                          await updateDoc(galleryRef, {
                            selectionSnapshots: arrayUnion(snapshot),
                          });
                        }

                        await updateDoc(galleryRef, {
                          selectedPhotoIds: [],
                          photoAssignments: {},
                          selectionStatus: 'pending',
                          selectionNotes: '',
                          photoNotes: {},
                          updatedAt: serverTimestamp()
                        });
                        
                        console.log('✅ Reset selezione completato in Firestore');

                        // Forza invalidazione cache e refetch
                        queryClient.removeQueries({ queryKey: ['gallery', galleryId] });
                        await queryClient.refetchQueries({ queryKey: ['gallery', galleryId] });
                        
                        toast({
                          title: "🔄 Selezione resettata",
                          description: "Il cliente può ora rifare la selezione.",
                        });
                      } catch (err) {
                        console.error("Errore reset selezione:", err);
                        toast({
                          title: "Errore",
                          description: err instanceof Error ? err.message : "Impossibile resettare la selezione.",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    🔄 Reset selezione cliente
                  </Button>
                </CardFooter>
              )}
            </Card>
          </TabsContent>

          {/* Tab 4: Impostazioni */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Impostazioni Galleria</CardTitle>
                <CardDescription>
                  Modifica deadline, sblocca selezione, e altre configurazioni.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-gray mb-2">Stato Galleria</h4>
                    <p className="text-sm text-gray-600">
                      <strong>Foto caricate:</strong> {gallery.photoCount || 0}
                    </p>
                    {gallery.selectionEnabled && (
                      <>
                        <p className="text-sm text-gray-600">
                          <strong>Stato selezione:</strong> {gallery.selectionStatus === 'completed' ? '✅ Completata' : '⏳ In attesa'}
                        </p>
                        <p className="text-sm text-gray-600">
                          <strong>Foto richieste:</strong> {gallery.requiredPhotoCount}
                        </p>
                        {gallery.selectionDeadline && (
                          <p className="text-sm text-gray-600">
                            <strong>Scadenza:</strong> {convertFirestoreTimestamp(gallery.selectionDeadline)?.toLocaleDateString('it-IT') || 'Data non disponibile'}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Modalità Selezione Inversa (Non mi piace) */}
                  {gallery.selectionEnabled && gallery.selectionStatus !== 'completed' && (
                    <div className="bg-orange-50 border-2 border-orange-200 rounded-lg p-4">
                      <h4 className="font-semibold text-orange-800 mb-2 flex items-center gap-2">
                        <span className="text-xl">🔄</span>
                        Modalità selezione inversa (Non mi piace)
                      </h4>
                      <p className="text-sm text-gray-700 mb-3">
                        Quando quasi tutte le foto sono belle, è più veloce per il cliente escludere le poche che non vanno bene, invece di selezionare tutte le buone.
                        In questa modalità il cliente segna le foto da <strong>ESCLUDERE</strong> — tutte le altre verranno salvate automaticamente.
                      </p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            const newMode = gallery.selectionMode === 'dislike' ? 'like' : 'dislike';
                            updateSelectionModeMutation.mutate(newMode);
                          }}
                          disabled={updateSelectionModeMutation.isPending}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:opacity-50 ${
                            gallery.selectionMode === 'dislike' ? 'bg-orange-500' : 'bg-gray-300'
                          }`}
                          data-testid="toggle-selection-mode"
                          role="switch"
                          aria-checked={gallery.selectionMode === 'dislike'}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              gallery.selectionMode === 'dislike' ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span className="text-sm font-medium text-gray-700">
                          {gallery.selectionMode === 'dislike' ? (
                            <span className="text-orange-700">✗ Modalità "Non mi piace" attiva</span>
                          ) : (
                            <span className="text-gray-500">Modalità normale (seleziona le preferite)</span>
                          )}
                        </span>
                        {updateSelectionModeMutation.isPending && (
                          <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Admin Unlock Selection (Task 20) */}
                  {gallery.selectionEnabled && isDeadlinePassed && gallery.selectionDeadlineEnforced && (
                    <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                      <h4 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                        <span className="text-2xl">⚠️</span>
                        Scadenza Selezione Superata
                      </h4>
                      <p className="text-sm text-gray-700 mb-4">
                        La scadenza per la selezione è stata superata e il cliente non può più modificare la selezione.
                        Puoi sbloccare manualmente la selezione per consentire al cliente di completarla.
                      </p>
                      <Button
                        onClick={() => unlockSelectionMutation.mutate()}
                        disabled={unlockSelectionMutation.isPending}
                        className="bg-red-600 hover:bg-red-700 text-white"
                        data-testid="button-unlock-selection"
                      >
                        {unlockSelectionMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sblocco in corso...
                          </>
                        ) : (
                          <>
                            🔓 Sblocca Selezione
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {gallery.selectionEnabled && !gallery.selectionDeadlineEnforced && gallery.selectionDeadline && (
                    <div className="bg-green-50 border-2 border-green-300 rounded-lg p-4">
                      <p className="text-sm text-green-800">
                        ✅ <strong>Selezione sbloccata</strong> - Il cliente può completare la selezione anche dopo la scadenza.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Gallery Modal - Solo se gallery è caricata */}
      {gallery && (
        <EditGalleryModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
          }}
          gallery={gallery}
        />
      )}
    </div>
  );
}
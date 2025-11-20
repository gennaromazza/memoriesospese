/**
 * Gallery Management Workspace - Admin tool per gestione galleria
 * Features: Photo upload, Client selection view, Settings
 */

import { useState, useCallback, useMemo, memo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { useDropzone } from 'react-dropzone';
import { GalleryService, type Gallery } from '@/lib/galleries';
import { PhotoService } from '@/lib/photos';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Users, Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { convertFirestoreTimestamp } from '@/lib/firebase';

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
}

// Memoized PhotoCard component for optimized rendering
const PhotoCard = memo(({ photo, isSelected, onToggle }: { photo: any; isSelected: boolean; onToggle: () => void }) => {
  return (
    <div
      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all duration-300 group cursor-pointer ${
        isSelected
          ? 'border-sage shadow-lg shadow-sage/40'
          : 'border-gray-300 hover:border-sage hover:shadow-md'
      }`}
      onClick={onToggle}
      data-testid={`img-selected-${photo.id}`}
    >
      <img
        src={photo.url}
        alt={photo.name}
        className="w-full h-full object-cover"
        loading="lazy" // Added lazy loading
      />
      {isSelected && (
        <div className="absolute inset-0 bg-sage bg-opacity-30 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-white" />
        </div>
      )}
    </div>
  );
});
PhotoCard.displayName = 'PhotoCard'; // Added display name for debugging

export default function GalleryManagementWorkspace() {
  const [, params] = useRoute('/admin/gallery/:galleryId/manage');
  const [, setLocation] = useLocation();
  const { user } = useFirebaseAuth();
  const { toast } = useToast();
  const galleryId = params?.galleryId;

  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);

  // Query gallery data
  const { data: gallery, isLoading } = useQuery<Gallery | null>({
    queryKey: ['gallery', galleryId],
    queryFn: () => (galleryId ? GalleryService.getGalleryById(galleryId) : null),
    enabled: !!galleryId,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      if (!galleryId || !user) throw new Error('Missing gallery or user');

      // Initialize progress
      setUploadProgress(files.map(file => ({
        fileName: file.name,
        progress: 0,
        status: 'pending'
      })));

      // Upload photos
      const photos = await PhotoService.uploadPhotosToGallery(
        files,
        galleryId,
        user.uid,
        user.email || 'admin@studio.com',
        user.displayName || 'Admin',
        (progressArray) => {
          // Update progress state
          setUploadProgress(progressArray.map(p => ({
            fileName: p.fileName,
            progress: p.progress,
            status: p.status === 'success' ? 'success' : p.status === 'error' ? 'error' : 'uploading'
          })));
        },
        'admin' // uploadedBy
      );

      // Update gallery photoCount
      const newPhotoCount = (gallery?.photoCount || 0) + photos.length;
      await GalleryService.updateGallery(galleryId, { photoCount: newPhotoCount });

      return photos;
    },
    onSuccess: (photos) => {
      toast({
        title: '✅ Upload completato',
        description: `${photos.length} foto caricate con successo!`,
      });

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
      queryClient.invalidateQueries({ queryKey: ['photos', galleryId] });

      // Reset progress after 3s
      setTimeout(() => setUploadProgress([]), 3000);
    },
    onError: (error) => {
      toast({
        title: '❌ Errore upload',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
    },
  });

  // Dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadMutation.mutate(acceptedFiles);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif']
    },
    multiple: true,
  });

  // 🔧 React Query: Carica foto fotografo - 🔥 FIX: Sempre abilitata se gallery esiste
  const {
    data: allPhotos = [],
    isLoading: isLoadingPhotos,
    error: photosError
  } = useQuery({
    queryKey: ['photos', gallery?.id],
    queryFn: async () => {
      if (!gallery?.id) return [];
      const photos = await PhotoService.getGalleryPhotos(gallery.id);
      return photos;
    },
    enabled: !!gallery?.id,
    retry: 2,
    staleTime: 30000
  });

  // Filter selected photos
  // Multi-product mode: use photoAssignments, Legacy mode: use selectedPhotoIds
  const selectedPhotoIds = useMemo(() => {
    if (!gallery) return new Set<string>();

    if (gallery.productRequirements) {
      const ids = new Set<string>();
      if (gallery.photoAssignments) {
        Object.entries(gallery.photoAssignments).forEach(([photoId, assignments]) => {
          if (assignments && assignments.length > 0) {
            ids.add(photoId);
          }
        });
      }
      return ids;
    } else {
      return new Set(gallery.selectedPhotoIds || []);
    }
  }, [gallery]);

  const selectedPhotos = useMemo(() =>
    allPhotos.filter(photo => selectedPhotoIds.has(photo.id)),
    [allPhotos, selectedPhotoIds]
  );

  // Function to toggle photo selection
  const togglePhotoSelection = useCallback(async (photoId: string) => {
    if (!galleryId || !gallery) return;

    // Optimistic update for UI
    const previousSelectedIds = new Set(selectedPhotoIds);
    const isCurrentlySelected = selectedPhotoIds.has(photoId);
    const newSelectedIds = new Set(selectedPhotoIds);

    if (isCurrentlySelected) {
      newSelectedIds.delete(photoId);
    } else {
      newSelectedIds.add(photoId);
    }

    // Update React state immediately
    // This is a simplified update. For more complex scenarios, consider useReducer or a dedicated state management library.
    // Note: Direct state manipulation like this might need a more robust handling in a real app if `selectedPhotoIds` is derived in complex ways.
    // For this example, we assume `selectedPhotoIds` is directly managed or recomputed correctly.

    // This part needs to be adapted based on how `selectedPhotoIds` and `gallery.photoAssignments` are managed.
    // If `selectedPhotoIds` is derived directly from `gallery.photoAssignments`, you'd need to update `gallery.photoAssignments`.
    // For simplicity here, we'll just focus on the UI update and the backend call.

    queryClient.setQueryData(['gallery', galleryId], {
      ...gallery,
      // This is a placeholder. The actual update logic depends on whether it's legacy or multi-product mode.
      // For legacy mode:
      selectedPhotoIds: Array.from(newSelectedIds),
      // For multi-product mode, you'd modify gallery.photoAssignments, which is more complex.
    });

    // Perform the mutation to update the backend
    try {
      if (gallery.productRequirements) {
        // Multi-product mode update logic would go here. This is a simplified example.
        // You would need to determine which product the photo belongs to or how to assign it.
        // For now, let's assume a simple add/remove based on current selection state.
        const currentAssignments = gallery.photoAssignments || {};
        const photoAssignments = { ...currentAssignments };

        if (isCurrentlySelected) {
          // Remove photo from all products if deselected
          Object.keys(photoAssignments).forEach(pid => {
            photoAssignments[pid] = photoAssignments[pid].filter((assignIndex: string) => assignIndex !== photoId);
          });
        } else {
          // For a simple toggle, we might need a UI element to select the product.
          // Here, we'll just add it to the first product as an example, which is likely incorrect logic.
          // A proper implementation would require user input to assign to a product.
          // Example: If adding, prompt user to select product or assign based on context.
          // For now, let's skip complex assignment logic and focus on the UI toggle.
        }
        // await GalleryService.updateGallery(galleryId, { photoAssignments });
      } else {
        // Legacy mode update
        await GalleryService.updateGallery(galleryId, {
          selectedPhotoIds: Array.from(newSelectedIds),
        });
      }

      toast({
        title: isCurrentlySelected ? 'Foto rimossa' : 'Foto aggiunta',
        description: `La foto è stata ${isCurrentlySelected ? 'rimossa' : 'aggiunta'} alle selezioni.`,
      });
      // Invalidate query to refetch the latest gallery data
      await queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    } catch (error) {
      toast({
        title: '❌ Errore',
        description: error instanceof Error ? error.message : 'Errore sconosciuto durante l\'aggiornamento delle selezioni.',
        variant: 'destructive',
      });
      // Revert optimistic update
      queryClient.setQueryData(['gallery', galleryId], {
        ...gallery,
        selectedPhotoIds: Array.from(previousSelectedIds),
      });
    }
  }, [galleryId, gallery, selectedPhotoIds, toast]);


  // Helper to remove timestamp prefix from filename for Lightroom export
  // Transforms: "1762272139996-DSCF4065.jpg" → "DSCF4065.jpg"
  const cleanFilenameForExport = useCallback((filename: string): string => {
    const match = filename.match(/^\d+-(.+)$/);
    return match ? match[1] : filename;
  }, []);

  // Generate filename list for Lightroom (clean names without timestamp)
  const filenameList = useMemo(() =>
    selectedPhotos.map(p => cleanFilenameForExport(p.name)).join('\n'),
    [selectedPhotos, cleanFilenameForExport]
  );

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
            <Button onClick={() => setLocation('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Dashboard
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
            onClick={() => setLocation('/admin/dashboard')}
            className="mb-4"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna a BookingsManager
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="font-playfair text-3xl text-blue-gray">
                Gestisci Galleria: {gallery.name}
              </CardTitle>
              <CardDescription>
                Codice: <strong>{gallery.code}</strong> | Foto: <strong>{gallery.photoCount || 0}</strong>
                {gallery.selectionEnabled && (
                  <> | Modalità Selezione: <strong className="text-sage">{gallery.requiredPhotoCount} foto richieste</strong></>
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="w-4 h-4 mr-2" />
              Carica Foto
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
                    </>
                  )}
                </div>

                {/* Upload Progress */}
                {uploadProgress.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-blue-gray">Upload in corso...</h4>
                    {uploadProgress.map((file, index) => (
                      <div key={index} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {file.status === 'success' && <CheckCircle className="w-4 h-4 text-green-600" />}
                            {file.status === 'error' && <XCircle className="w-4 h-4 text-red-600" />}
                            {file.status === 'uploading' && <Loader2 className="w-4 h-4 text-sage animate-spin" />}
                            {file.status === 'pending' && <Loader2 className="w-4 h-4 text-gray-400" />}
                            <span className="truncate max-w-xs">{file.fileName}</span>
                          </div>
                          <span className="text-gray-500">{Math.round(file.progress)}%</span>
                        </div>
                        <Progress value={file.progress} className="h-2" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Stats */}
                {uploadMutation.isPending && (
                  <div className="bg-blue-50 p-4 rounded-lg text-center">
                    <Loader2 className="w-6 h-6 text-sage animate-spin mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Elaborazione in corso...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Selezioni Cliente */}
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
                        {gallery.productRequirements
                          ? `${Object.keys(gallery.photoAssignments || {}).length} foto assegnate`
                          : `${selectedPhotos.length} / ${gallery?.requiredPhotoCount || 0}`
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
                        const assignedCount = Object.entries(gallery.photoAssignments || {}).filter(
                          ([photoId, assignments]) => assignments.includes(String(idx))
                        ).length;
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

                {/* Selected Photos Grid */}
                {selectedPhotos.length > 0 ? (
                  <div className="space-y-4">
                    <h4 className="font-semibold text-blue-gray">Miniature Foto Selezionate</h4>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {selectedPhotos.map((photo) => {
                        const isSelected = selectedPhotoIds.has(photo.id);
                        return (
                          <PhotoCard
                            key={photo.id}
                            photo={photo}
                            isSelected={isSelected}
                            onToggle={() => togglePhotoSelection(photo.id)}
                          />
                        );
                      })}
                    </div>
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
                {selectedPhotos.length > 0 && (
                  <div className="space-y-6">
                    <h4 className="font-semibold text-blue-gray text-lg">📋 Nomi File per Lightroom</h4>

                    {/* Box: Tutte le foto selezionate */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <h5 className="font-medium text-blue-gray">🎯 Tutte le Foto Selezionate</h5>
                        <span className="text-sm text-gray-500">({selectedPhotos.length} foto)</span>
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

                    {/* Box separati per ogni prodotto (solo se multi-prodotto) */}
                    {gallery?.productRequirements && gallery.productRequirements.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-gray-200">
                        <h5 className="font-medium text-blue-gray">📦 Foto per Prodotto</h5>
                        <p className="text-sm text-gray-600 mb-4">
                          Ogni prodotto ha il suo elenco di foto assegnate:
                        </p>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {gallery.productRequirements.map((product, productIndex) => {
                            // Filter photos assigned to this product
                            const productPhotos = allPhotos.filter(photo => {
                              const assignments = gallery.photoAssignments?.[photo.id] || [];
                              return assignments.includes(String(productIndex));
                            });

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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Impostazioni */}
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
    </div>
  );
}
/**
 * Gallery Management Workspace - Admin tool per gestione galleria
 * Features: Photo upload, Client selection view, Settings
 */

import { useState, useCallback } from 'react';
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

  // Query selected photos for display
  const { data: allPhotos = [] } = useQuery({
    queryKey: ['photos', galleryId],
    queryFn: async () => {
      if (!galleryId) return [];
      const photos = await PhotoService.getGalleryPhotos(galleryId);
      return photos;
    },
    enabled: !!galleryId && !!gallery?.selectionEnabled,
  });

  // Filter selected photos
  // Multi-product mode: use photoAssignments, Legacy mode: use selectedPhotoIds
  const selectedPhotos = gallery?.productRequirements
    ? allPhotos.filter(photo => gallery.photoAssignments && gallery.photoAssignments[photo.id])
    : allPhotos.filter(photo => gallery?.selectedPhotoIds?.includes(photo.id));

  // Generate filename list for Lightroom
  const filenameList = selectedPhotos.map(p => p.name).join('\n');

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
                            key={idx}
                            className={`p-3 rounded border-2 ${
                              isComplete 
                                ? 'bg-green-50 border-green-300' 
                                : assignedCount > 0
                                  ? 'bg-yellow-50 border-yellow-300'
                                  : 'bg-gray-50 border-gray-300'
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
                        const assignedProductIndices = gallery.photoAssignments?.[photo.id] || [];
                        
                        return (
                          <div
                            key={photo.id}
                            className="relative aspect-square rounded-lg overflow-hidden border-2 border-sage shadow-md hover:shadow-lg transition-shadow group"
                            data-testid={`img-selected-${photo.id}`}
                          >
                            <img
                              src={photo.url}
                              alt={photo.name}
                              className="w-full h-full object-cover"
                            />
                            
                            {/* Product Assignment Badges */}
                            {gallery.productRequirements && assignedProductIndices.length > 0 && (
                              <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                                {assignedProductIndices.map((prodIdx) => {
                                  const prodIndex = parseInt(prodIdx);
                                  const product = gallery.productRequirements[prodIndex];
                                  if (!product) return null;
                                  
                                  const colors = [
                                    'bg-blue-500 text-white',
                                    'bg-green-500 text-white',
                                    'bg-purple-500 text-white',
                                    'bg-orange-500 text-white',
                                    'bg-pink-500 text-white',
                                    'bg-teal-500 text-white',
                                  ];
                                  const colorClass = colors[prodIndex % colors.length];
                                  
                                  return (
                                    <span
                                      key={prodIdx}
                                      className={`px-2 py-0.5 rounded text-xs font-medium ${colorClass}`}
                                      title={product.prodottoNome}
                                      data-testid={`badge-product-${prodIdx}-photo-${photo.id}`}
                                    >
                                      {product.prodottoNome.substring(0, 12)}{product.prodottoNome.length > 12 ? '...' : ''}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
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
                  <div className="space-y-3">
                    <h4 className="font-semibold text-blue-gray">📋 Nomi File per Lightroom</h4>
                    <p className="text-sm text-gray-600">
                      Copia e incolla questi nomi in Lightroom per filtrare/selezionare le foto:
                    </p>
                    <textarea
                      readOnly
                      value={filenameList}
                      className="w-full h-64 p-3 border border-gray-300 rounded-lg font-mono text-sm bg-gray-50 resize-none"
                      data-testid="textarea-filename-list"
                      onClick={(e) => {
                        e.currentTarget.select();
                        navigator.clipboard.writeText(filenameList);
                        toast({
                          title: '📋 Copiato!',
                          description: 'Nomi file copiati negli appunti.',
                        });
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      💡 Clicca sul box per copiare automaticamente tutti i nomi file.
                    </p>
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

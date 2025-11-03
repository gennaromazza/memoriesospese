/**
 * Gallery Management Workspace - Admin tool per gestione galleria
 * Features: Photo upload, Client selection view, Settings
 */

import { useState, useCallback, useEffect, ChangeEvent } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Upload, Users, Settings, CheckCircle, XCircle, Loader2, X, Plus } from 'lucide-react';
import { convertFirestoreTimestamp, storage } from '@/lib/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import { getAllThemes } from '@shared/special-themes';
import { Timestamp } from 'firebase/firestore';

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
  
  // Form states for gallery settings
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [locationField, setLocationField] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [coverImageMobileUrl, setCoverImageMobileUrl] = useState('');
  const [coverImageDesktopUrl, setCoverImageDesktopUrl] = useState('');
  const [youtubeUrls, setYoutubeUrls] = useState<string[]>([]);
  const [newYoutubeUrl, setNewYoutubeUrl] = useState('');
  const [specialTheme, setSpecialTheme] = useState<string>('none');
  const [specialPin, setSpecialPin] = useState('');
  const [selectionEnabled, setSelectionEnabled] = useState(false);
  const [requiredPhotoCount, setRequiredPhotoCount] = useState<number>(50);
  const [selectionDeadline, setSelectionDeadline] = useState<string>('');
  const [selectionDeadlineEnforced, setSelectionDeadlineEnforced] = useState(true);
  
  const availableThemes = getAllThemes();

  // Query gallery data
  const { data: gallery, isLoading } = useQuery<Gallery | null>({
    queryKey: ['gallery', galleryId],
    queryFn: () => (galleryId ? GalleryService.getGalleryById(galleryId) : null),
    enabled: !!galleryId,
  });

  // Populate form fields when gallery loads
  useEffect(() => {
    if (gallery) {
      setName(gallery.name || '');
      setDate(gallery.date || '');
      setLocationField(gallery.location || '');
      setDescription(gallery.description || '');
      setPassword(gallery.password || '');
      setCoverImageMobileUrl(gallery.coverImageMobile || '');
      setCoverImageDesktopUrl(gallery.coverImageDesktop || '');
      
      // YouTube URLs retrocompatibility
      const urls: string[] = [];
      if (gallery.youtubeUrls && gallery.youtubeUrls.length > 0) {
        urls.push(...gallery.youtubeUrls);
      } else if (gallery.youtubeUrl) {
        urls.push(gallery.youtubeUrl);
      }
      setYoutubeUrls(urls);
      setNewYoutubeUrl('');
      
      setSpecialTheme(gallery.specialTheme || 'none');
      setSpecialPin(gallery.specialPin || '');
      setSelectionEnabled(gallery.selectionEnabled || false);
      setRequiredPhotoCount(gallery.requiredPhotoCount || 50);
      setSelectionDeadlineEnforced(gallery.selectionDeadlineEnforced !== false);
      
      // Convert Firestore Timestamp to date string for input[type="date"]
      if (gallery.selectionDeadline) {
        const deadline = gallery.selectionDeadline;
        const deadlineDate = deadline.toDate ? deadline.toDate() : new Date(deadline);
        setSelectionDeadline(deadlineDate.toISOString().split('T')[0]);
      } else {
        setSelectionDeadline('');
      }
    }
  }, [gallery]);

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
  const selectedPhotos = allPhotos.filter(photo => 
    gallery?.selectedPhotoIds?.includes(photo.id)
  );

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

  // Save gallery settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      if (!galleryId) throw new Error('Missing galleryId');
      
      // Prepare update data
      const updateData: any = {
        name,
        date,
        location: locationField,
        description,
        password,
        coverImageMobile: coverImageMobileUrl,
        coverImageDesktop: coverImageDesktopUrl,
        youtubeUrls,
        specialTheme: specialTheme === 'none' ? null : specialTheme,
        specialPin: specialTheme === 'none' ? null : specialPin,
        selectionEnabled,
        requiredPhotoCount,
        selectionDeadlineEnforced,
      };

      // Handle selection deadline conversion
      if (selectionDeadline) {
        const deadlineDate = new Date(selectionDeadline);
        updateData.selectionDeadline = Timestamp.fromDate(deadlineDate);
      } else {
        updateData.selectionDeadline = null;
      }

      await GalleryService.updateGallery(galleryId, updateData);
    },
    onSuccess: () => {
      toast({
        title: '✅ Impostazioni salvate',
        description: 'Le modifiche alla galleria sono state salvate con successo.',
      });
      queryClient.invalidateQueries({ queryKey: ['gallery', galleryId] });
    },
    onError: (error) => {
      toast({
        title: '❌ Errore salvataggio',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
    },
  });

  // Cover image upload helpers
  const compressImage = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };
    return await imageCompression(file, options);
  };

  const handleMobileCoverChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !galleryId) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: '❌ Tipo file non supportato',
        description: "L'immagine deve essere un file immagine (JPEG, PNG, ecc.)",
        variant: 'destructive',
      });
      return;
    }

    try {
      const compressedFile = await compressImage(file);
      const storageRef = ref(storage, `galleries/${galleryId}/covers/mobile_${Date.now()}.jpg`);
      await uploadBytesResumable(storageRef, compressedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      setCoverImageMobileUrl(downloadUrl);
      
      toast({
        title: '✅ Immagine caricata',
        description: 'Immagine mobile caricata con successo',
      });
    } catch (error) {
      console.error('Errore caricamento immagine mobile:', error);
      toast({
        title: '❌ Errore',
        description: "Errore durante il caricamento dell'immagine mobile",
        variant: 'destructive',
      });
    }
  };

  const handleDesktopCoverChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0 || !galleryId) return;

    const file = e.target.files[0];
    if (!file.type.startsWith('image/')) {
      toast({
        title: '❌ Tipo file non supportato',
        description: "L'immagine deve essere un file immagine (JPEG, PNG, ecc.)",
        variant: 'destructive',
      });
      return;
    }

    try {
      const compressedFile = await compressImage(file);
      const storageRef = ref(storage, `galleries/${galleryId}/covers/desktop_${Date.now()}.jpg`);
      await uploadBytesResumable(storageRef, compressedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      setCoverImageDesktopUrl(downloadUrl);
      
      toast({
        title: '✅ Immagine caricata',
        description: 'Immagine desktop caricata con successo',
      });
    } catch (error) {
      console.error('Errore caricamento immagine desktop:', error);
      toast({
        title: '❌ Errore',
        description: "Errore durante il caricamento dell'immagine desktop",
        variant: 'destructive',
      });
    }
  };

  // YouTube URLs helpers
  const handleAddYoutubeUrl = () => {
    if (newYoutubeUrl.trim() && !youtubeUrls.includes(newYoutubeUrl.trim())) {
      setYoutubeUrls([...youtubeUrls, newYoutubeUrl.trim()]);
      setNewYoutubeUrl('');
    }
  };

  const handleRemoveYoutubeUrl = (url: string) => {
    setYoutubeUrls(youtubeUrls.filter(u => u !== url));
  };

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
                        {selectedPhotos.length} / {gallery?.requiredPhotoCount || 0}
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
                      {selectedPhotos.map((photo) => (
                        <div
                          key={photo.id}
                          className="relative aspect-square rounded-lg overflow-hidden border-2 border-sage shadow-md hover:shadow-lg transition-shadow"
                          data-testid={`img-selected-${photo.id}`}
                        >
                          <img
                            src={photo.url}
                            alt={photo.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
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
                <div className="space-y-6">
                  {/* Status Section */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-gray mb-2">Stato Galleria</h4>
                    <p className="text-sm text-gray-600">
                      <strong>Codice:</strong> {gallery.code}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>Foto caricate:</strong> {gallery.photoCount || 0}
                    </p>
                  </div>

                  {/* Basic Details */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-gray border-b pb-2">Dettagli Galleria</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="gallery-name">Nome Galleria *</Label>
                        <Input
                          id="gallery-name"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Nome evento"
                          data-testid="input-gallery-name"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="gallery-date">Data *</Label>
                        <Input
                          id="gallery-date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          data-testid="input-gallery-date"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="gallery-location">Location</Label>
                        <Input
                          id="gallery-location"
                          value={locationField}
                          onChange={(e) => setLocationField(e.target.value)}
                          placeholder="Città o luogo evento"
                          data-testid="input-gallery-location"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="gallery-password">Password Accesso</Label>
                        <Input
                          id="gallery-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Password per accedere"
                          data-testid="input-gallery-password"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gallery-description">Descrizione</Label>
                      <Textarea
                        id="gallery-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Descrizione dell'evento..."
                        rows={3}
                        data-testid="textarea-gallery-description"
                      />
                    </div>
                  </div>

                  {/* Cover Images */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-gray border-b pb-2">Immagini di Copertina</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="cover-mobile">Cover Mobile (9:16)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="cover-mobile"
                            type="file"
                            accept="image/*"
                            onChange={handleMobileCoverChange}
                            data-testid="input-cover-mobile"
                          />
                          {coverImageMobileUrl && (
                            <img 
                              src={coverImageMobileUrl} 
                              alt="Mobile" 
                              className="h-16 w-9 object-cover rounded border"
                            />
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="cover-desktop">Cover Desktop (16:9)</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="cover-desktop"
                            type="file"
                            accept="image/*"
                            onChange={handleDesktopCoverChange}
                            data-testid="input-cover-desktop"
                          />
                          {coverImageDesktopUrl && (
                            <img 
                              src={coverImageDesktopUrl} 
                              alt="Desktop" 
                              className="h-9 w-16 object-cover rounded border"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* YouTube URLs */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-gray border-b pb-2">Video YouTube</h3>
                    
                    <div className="flex gap-2">
                      <Input
                        value={newYoutubeUrl}
                        onChange={(e) => setNewYoutubeUrl(e.target.value)}
                        placeholder="https://www.youtube.com/watch?v=..."
                        data-testid="input-youtube-url"
                      />
                      <Button
                        type="button"
                        onClick={handleAddYoutubeUrl}
                        disabled={!newYoutubeUrl.trim()}
                        data-testid="button-add-youtube"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Aggiungi
                      </Button>
                    </div>

                    {youtubeUrls.length > 0 && (
                      <div className="space-y-2">
                        {youtubeUrls.map((url, index) => (
                          <div key={index} className="flex items-center gap-2 bg-gray-50 p-2 rounded">
                            <span className="flex-1 text-sm truncate">{url}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveYoutubeUrl(url)}
                              data-testid={`button-remove-youtube-${index}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Special Theme */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-gray border-b pb-2">Tema Speciale</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="special-theme">Tema</Label>
                        <Select value={specialTheme} onValueChange={setSpecialTheme}>
                          <SelectTrigger id="special-theme" data-testid="select-theme">
                            <SelectValue placeholder="Nessun tema" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessun tema</SelectItem>
                            {availableThemes.map(theme => (
                              <SelectItem key={theme.id} value={theme.id}>
                                {theme.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {specialTheme !== 'none' && (
                        <div className="space-y-2">
                          <Label htmlFor="special-pin">PIN Accesso</Label>
                          <Input
                            id="special-pin"
                            value={specialPin}
                            onChange={(e) => setSpecialPin(e.target.value)}
                            placeholder="PIN per galleria tematica"
                            data-testid="input-special-pin"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photo Selection Configuration */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-blue-gray border-b pb-2">Modalità Selezione Foto</h3>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="selection-enabled"
                        checked={selectionEnabled}
                        onCheckedChange={setSelectionEnabled}
                        data-testid="switch-selection-enabled"
                      />
                      <Label htmlFor="selection-enabled">Abilita Selezione Foto</Label>
                    </div>

                    {selectionEnabled && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-8">
                        <div className="space-y-2">
                          <Label htmlFor="required-count">Foto Richieste</Label>
                          <Input
                            id="required-count"
                            type="number"
                            min="1"
                            value={requiredPhotoCount}
                            onChange={(e) => setRequiredPhotoCount(parseInt(e.target.value) || 50)}
                            data-testid="input-required-count"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="selection-deadline">Scadenza</Label>
                          <Input
                            id="selection-deadline"
                            type="date"
                            value={selectionDeadline}
                            onChange={(e) => setSelectionDeadline(e.target.value)}
                            data-testid="input-selection-deadline"
                          />
                        </div>

                        <div className="flex items-center space-x-2 pt-8">
                          <Switch
                            id="deadline-enforced"
                            checked={selectionDeadlineEnforced}
                            onCheckedChange={setSelectionDeadlineEnforced}
                            data-testid="switch-deadline-enforced"
                          />
                          <Label htmlFor="deadline-enforced">Blocca dopo scadenza</Label>
                        </div>
                      </div>
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

                  {/* Save Button */}
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      onClick={() => saveSettingsMutation.mutate()}
                      disabled={saveSettingsMutation.isPending}
                      className="bg-sage hover:bg-sage/90"
                      data-testid="button-save-settings"
                    >
                      {saveSettingsMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvataggio...
                        </>
                      ) : (
                        '💾 Salva Modifiche'
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

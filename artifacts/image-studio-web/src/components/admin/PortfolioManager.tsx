import { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy, query } from 'firebase/firestore';
import { where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { StorageService } from '@/lib/storage';
import { getActiveJobTypes } from '@/lib/job-types';
import type { JobTypeFE } from '@shared/job-types';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useDropzone } from 'react-dropzone';
import { Plus, Trash2, Star, Image, Grid3x3, Loader2, CheckSquare, Square, Search, Upload, X } from 'lucide-react';

interface PortfolioSelection {
  id: string;
  galleryId: string;
  galleryName: string;
  photoId: string;
  photoUrl: string;
  jobType: string;
  featured: boolean;
  sortOrder: number;
  caption?: string;
  clientName?: string;
  eventDate?: any;
}

interface Gallery {
  id: string;
  name: string;
  date: string;
  photoCount: number;
}

interface Photo {
  id: string;
  url: string;
  name: string;
}


export default function PortfolioManager() {
  const [selections, setSelections] = useState<PortfolioSelection[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [jobTypes, setJobTypes] = useState<JobTypeFE[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<string>('');
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [selectedJobType, setSelectedJobType] = useState<string>('');
  const [filterJobType, setFilterJobType] = useState<string>('all');
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  // --- Ricerca ---
  const [gallerySearch, setGallerySearch] = useState('');
  const [photoSearch, setPhotoSearch] = useState('');

  // --- Caricamento diretto ---
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadJobType, setUploadJobType] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [addMode, setAddMode] = useState<'gallery' | 'upload'>('gallery');

  const { toast } = useToast();

  useEffect(() => {
    loadSelections();
    loadGalleries();
    loadJobTypes();
  }, []);

  const loadJobTypes = async () => {
    try {
      const types = await getActiveJobTypes();
      setJobTypes(types);
      if (types.length > 0) {
        setSelectedJobType(types[0].slug);
        setUploadJobType(types[0].slug);
      }
    } catch (error) {
      console.error('Errore caricamento tipi lavoro:', error);
    }
  };

  const loadSelections = async () => {
    try {
      const q = query(collection(db, 'portfolioSelections'), orderBy('sortOrder', 'asc'));
      const snapshot = await getDocs(q);
      setSelections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as PortfolioSelection[]);
    } catch (error) {
      toast({ title: "Errore", description: "Impossibile caricare il portfolio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadGalleries = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'galleries'));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Gallery[];
      setGalleries(data.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    } catch (error) {
      console.error('Errore caricamento gallerie:', error);
    }
  };

  const loadGalleryPhotos = async (galleryId: string) => {
    setLoadingPhotos(true);
    setPhotoSearch('');
    try {
      const q = query(collection(db, 'photos'), where('galleryId', '==', galleryId));
      const snapshot = await getDocs(q);

      // Se vuota, prova gallery-photos
      let data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Photo[];
      if (data.length === 0) {
        const q2 = query(collection(db, 'gallery-photos'), where('galleryId', '==', galleryId));
        const snap2 = await getDocs(q2);
        data = snap2.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Photo[];
      }
      setPhotos(data);
    } catch (error) {
      toast({ title: "Errore", description: "Impossibile caricare le foto della galleria", variant: "destructive" });
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleGalleryChange = (galleryId: string) => {
    setSelectedGallery(galleryId);
    setSelectedPhotos(new Set());
    if (galleryId) loadGalleryPhotos(galleryId);
    else setPhotos([]);
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => {
      const next = new Set(prev);
      next.has(photoId) ? next.delete(photoId) : next.add(photoId);
      return next;
    });
  };

  // Gallerie filtrate per ricerca
  const filteredGalleries = gallerySearch.trim()
    ? galleries.filter(g => g.name.toLowerCase().includes(gallerySearch.toLowerCase()))
    : galleries;

  // Foto filtrate per ricerca
  const filteredPhotos = photoSearch.trim()
    ? photos.filter(p => p.name.toLowerCase().includes(photoSearch.toLowerCase()))
    : photos;

  const handleAddToPortfolio = async () => {
    if (!selectedGallery || selectedPhotos.size === 0) {
      toast({ title: "Attenzione", description: "Seleziona una galleria e almeno una foto", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const gallery = galleries.find(g => g.id === selectedGallery);
      if (!gallery) return;
      const maxSortOrder = selections.length > 0 ? Math.max(...selections.map(s => s.sortOrder)) : 0;
      const promises = Array.from(selectedPhotos).map(async (photoId, index) => {
        const photo = photos.find(p => p.id === photoId);
        if (!photo) return;
        await addDoc(collection(db, 'portfolioSelections'), {
          galleryId: selectedGallery,
          galleryName: gallery.name,
          photoId,
          photoUrl: photo.url,
          jobType: selectedJobType,
          featured: false,
          sortOrder: maxSortOrder + index + 1,
          createdAt: new Date()
        });
      });
      await Promise.allSettled(promises);
      toast({ title: "Successo", description: `${selectedPhotos.size} foto aggiunte al portfolio` });
      setAddDialogOpen(false);
      resetDialog();
      loadSelections();
    } catch (error) {
      toast({ title: "Errore", description: "Impossibile aggiungere le foto", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ---- Caricamento diretto ----
  const onDrop = useCallback((accepted: File[]) => {
    setUploadFiles(prev => [...prev, ...accepted]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    multiple: true
  });

  const removeUploadFile = (idx: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleDirectUpload = async () => {
    if (uploadFiles.length === 0) {
      toast({ title: "Attenzione", description: "Aggiungi almeno una foto", variant: "destructive" });
      return;
    }
    setUploading(true);
    const maxSortOrder = selections.length > 0 ? Math.max(...selections.map(s => s.sortOrder)) : 0;
    let success = 0;
    try {
      for (let i = 0; i < uploadFiles.length; i++) {
        const file = uploadFiles[i];
        const result = await StorageService.uploadFile(file, 'portfolio-direct', (p) => {
          setUploadProgress(prev => ({ ...prev, [file.name]: p.progress }));
        });
        await addDoc(collection(db, 'portfolioSelections'), {
          galleryId: 'direct-upload',
          galleryName: 'Caricamento Diretto',
          photoId: `direct-${Date.now()}-${i}`,
          photoUrl: result.url,
          jobType: uploadJobType,
          featured: false,
          sortOrder: maxSortOrder + i + 1,
          createdAt: new Date()
        });
        success++;
      }
      toast({ title: "Successo", description: `${success} foto caricate nel portfolio` });
      setAddDialogOpen(false);
      resetDialog();
      loadSelections();
    } catch (error) {
      toast({ title: "Errore", description: "Errore durante il caricamento", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const resetDialog = () => {
    setSelectedGallery('');
    setSelectedPhotos(new Set());
    setPhotos([]);
    setGallerySearch('');
    setPhotoSearch('');
    setUploadFiles([]);
    setUploadProgress({});
    setAddMode('gallery');
  };

  const toggleFeatured = async (selection: PortfolioSelection) => {
    try {
      await updateDoc(doc(db, 'portfolioSelections', selection.id), { featured: !selection.featured });
      loadSelections();
      toast({ title: "Aggiornato", description: selection.featured ? "Rimossa da evidenza" : "Aggiunta a evidenza" });
    } catch {
      toast({ title: "Errore", description: "Impossibile aggiornare", variant: "destructive" });
    }
  };

  const removeFromPortfolio = async (selectionId: string) => {
    if (!confirm('Rimuovere questa foto dal portfolio pubblico?')) return;
    try {
      await deleteDoc(doc(db, 'portfolioSelections', selectionId));
      loadSelections();
      toast({ title: "Rimossa", description: "Foto rimossa dal portfolio" });
    } catch {
      toast({ title: "Errore", description: "Impossibile rimuovere", variant: "destructive" });
    }
  };

  const filteredSelections = filterJobType === 'all' ? selections : selections.filter(s => s.jobType === filterJobType);
  const groupedByCategory = filteredSelections.reduce((acc, sel) => {
    if (!acc[sel.jobType]) acc[sel.jobType] = [];
    acc[sel.jobType].push(sel);
    return acc;
  }, {} as Record<string, PortfolioSelection[]>);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Portfolio Pubblico</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci le foto visibili sul sito pubblico — {selections.length} foto selezionate
          </p>
        </div>

        <Dialog open={addDialogOpen} onOpenChange={(open) => { setAddDialogOpen(open); if (!open) resetDialog(); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-portfolio-photo">
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Foto
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Aggiungi Foto al Portfolio Pubblico</DialogTitle>
              <DialogDescription>
                Scegli una foto da una galleria esistente oppure carica direttamente dal tuo dispositivo.
              </DialogDescription>
            </DialogHeader>

            <Tabs value={addMode} onValueChange={(v) => setAddMode(v as 'gallery' | 'upload')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="gallery">
                  <Grid3x3 className="h-4 w-4 mr-2" />
                  Da Galleria
                </TabsTrigger>
                <TabsTrigger value="upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Carica Direttamente
                </TabsTrigger>
              </TabsList>

              {/* Tab: Da Galleria */}
              <TabsContent value="gallery" className="space-y-4 pt-4">
                {/* Ricerca galleria */}
                <div className="space-y-2">
                  <Label>Galleria</Label>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Cerca galleria per nome..."
                      value={gallerySearch}
                      onChange={(e) => setGallerySearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={selectedGallery} onValueChange={handleGalleryChange}>
                    <SelectTrigger data-testid="select-gallery">
                      <SelectValue placeholder={`Seleziona una galleria (${filteredGalleries.length} trovate)`} />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {filteredGalleries.length === 0 ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                          Nessuna galleria trovata
                        </div>
                      ) : (
                        filteredGalleries.map(gallery => (
                          <SelectItem key={gallery.id} value={gallery.id}>
                            {gallery.name} — {gallery.date} ({gallery.photoCount || '?'} foto)
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {selectedGallery && (
                  <>
                    <div className="space-y-2">
                      <Label>Categoria</Label>
                      <Select value={selectedJobType} onValueChange={setSelectedJobType}>
                        <SelectTrigger data-testid="select-job-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {jobTypes.map(type => (
                            <SelectItem key={type.slug} value={type.slug}>{type.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Foto ({selectedPhotos.size} selezionate su {filteredPhotos.length} visibili)</Label>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => setSelectedPhotos(new Set(filteredPhotos.map(p => p.id)))}
                            disabled={filteredPhotos.length === 0} data-testid="button-select-all">
                            <CheckSquare className="h-4 w-4 mr-1" /> Tutte
                          </Button>
                          <Button type="button" size="sm" variant="outline"
                            onClick={() => setSelectedPhotos(new Set())}
                            disabled={selectedPhotos.size === 0} data-testid="button-deselect-all">
                            <Square className="h-4 w-4 mr-1" /> Nessuna
                          </Button>
                        </div>
                      </div>

                      {/* Ricerca foto */}
                      {photos.length > 0 && (
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Cerca foto per nome..."
                            value={photoSearch}
                            onChange={(e) => setPhotoSearch(e.target.value)}
                            className="pl-9"
                          />
                        </div>
                      )}

                      {loadingPhotos ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin" />
                        </div>
                      ) : filteredPhotos.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">
                          {photoSearch ? `Nessuna foto trovata con "${photoSearch}"` : 'Nessuna foto in questa galleria'}
                        </p>
                      ) : (
                        <div className="columns-4 gap-2 max-h-80 overflow-y-auto border rounded-md p-2">
                          {filteredPhotos.map(photo => (
                            <div
                              key={photo.id}
                              onClick={() => togglePhotoSelection(photo.id)}
                              className={`relative cursor-pointer border-2 rounded-md overflow-hidden transition-all group mb-2 break-inside-avoid ${
                                selectedPhotos.has(photo.id)
                                  ? 'border-primary ring-2 ring-primary'
                                  : 'border-transparent hover:border-primary/50'
                              }`}
                              data-testid={`photo-option-${photo.id}`}
                            >
                              <img src={photo.url} alt={photo.name} className="w-full h-auto object-cover" />
                              <div className="absolute top-2 left-2 bg-white rounded-md shadow-sm p-1 pointer-events-none">
                                <Checkbox checked={selectedPhotos.has(photo.id)} className="pointer-events-none" />
                              </div>
                              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none">
                                <Button
                                  size="sm" variant="secondary" className="h-8 w-8 p-0 pointer-events-auto"
                                  onClick={(e) => { e.stopPropagation(); setLightboxPhoto(photo); setLightboxOpen(true); }}
                                >
                                  <Image className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Annulla</Button>
                  <Button onClick={handleAddToPortfolio} disabled={selectedPhotos.size === 0 || saving} data-testid="button-confirm-add-photo">
                    {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Aggiunta...</> : `Aggiungi ${selectedPhotos.size > 0 ? `${selectedPhotos.size} ` : ''}Foto`}
                  </Button>
                </DialogFooter>
              </TabsContent>

              {/* Tab: Caricamento diretto */}
              <TabsContent value="upload" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label>Categoria</Label>
                  <Select value={uploadJobType} onValueChange={setUploadJobType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {jobTypes.map(type => (
                        <SelectItem key={type.slug} value={type.slug}>{type.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Dropzone */}
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                    isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
                  }`}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                  {isDragActive ? (
                    <p className="text-primary font-medium">Rilascia le foto qui...</p>
                  ) : (
                    <>
                      <p className="font-medium">Trascina le foto qui</p>
                      <p className="text-sm text-muted-foreground mt-1">oppure clicca per selezionarle</p>
                    </>
                  )}
                </div>

                {/* Anteprima file selezionati */}
                {uploadFiles.length > 0 && (
                  <div className="space-y-2">
                    <Label>{uploadFiles.length} foto selezionate</Label>
                    <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                      {uploadFiles.map((file, idx) => (
                        <div key={idx} className="relative group rounded-md overflow-hidden border">
                          <img
                            src={URL.createObjectURL(file)}
                            alt={file.name}
                            className="w-full h-20 object-cover"
                          />
                          {uploadProgress[file.name] !== undefined && uploadProgress[file.name] < 100 && (
                            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                              <span className="text-white text-xs font-bold">{uploadProgress[file.name]}%</span>
                            </div>
                          )}
                          {uploadProgress[file.name] === 100 && (
                            <div className="absolute inset-0 bg-green-500/50 flex items-center justify-center">
                              <span className="text-white text-xs font-bold">✓</span>
                            </div>
                          )}
                          {!uploading && (
                            <button
                              onClick={() => removeUploadFile(idx)}
                              className="absolute top-1 right-1 bg-black/70 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddDialogOpen(false)} disabled={uploading}>Annulla</Button>
                  <Button onClick={handleDirectUpload} disabled={uploadFiles.length === 0 || uploading}>
                    {uploading
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Caricamento...</>
                      : <><Upload className="h-4 w-4 mr-2" />Carica {uploadFiles.length > 0 ? `${uploadFiles.length} ` : ''}Foto</>
                    }
                  </Button>
                </DialogFooter>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filtro categoria */}
      <div className="flex gap-2 items-center">
        <Label>Filtra per categoria:</Label>
        <Select value={filterJobType} onValueChange={setFilterJobType}>
          <SelectTrigger className="w-48" data-testid="filter-job-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {jobTypes.map(type => (
              <SelectItem key={type.slug} value={type.slug}>{type.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Portfolio grid */}
      {Object.keys(groupedByCategory).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nessuna foto nel portfolio. Clicca "Aggiungi Foto" per iniziare.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByCategory).map(([jobType, items]) => (
          <Card key={jobType}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Grid3x3 className="h-5 w-5" />
                {jobTypes.find(t => t.slug === jobType)?.nome || jobType}
                <Badge variant="secondary">{items.length} foto</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="columns-2 md:columns-4 lg:columns-6 gap-4">
                {items.map(selection => (
                  <div key={selection.id} className="relative group mb-4 break-inside-avoid">
                    <img
                      src={selection.photoUrl}
                      alt={selection.galleryName}
                      className="w-full h-auto object-cover rounded-md"
                      data-testid={`portfolio-photo-${selection.id}`}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center gap-2">
                      <Button size="sm" variant={selection.featured ? "default" : "secondary"}
                        onClick={() => toggleFeatured(selection)} data-testid={`button-toggle-featured-${selection.id}`}>
                        <Star className={`h-4 w-4 ${selection.featured ? 'fill-current' : ''}`} />
                      </Button>
                      <Button size="sm" variant="destructive"
                        onClick={() => removeFromPortfolio(selection.id)} data-testid={`button-remove-${selection.id}`}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {selection.featured && (
                      <Badge className="absolute top-2 left-2 bg-yellow-500">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Featured
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 truncate">{selection.galleryName}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-5xl max-h-[95vh] p-2">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Anteprima Foto</DialogTitle>
          </DialogHeader>
          <div className="relative w-full h-[70vh] flex items-center justify-center bg-black/5 rounded-lg overflow-hidden">
            {lightboxPhoto && (
              <img src={lightboxPhoto.url} alt={lightboxPhoto.name} className="max-w-full max-h-full object-contain" />
            )}
          </div>
          <DialogFooter className="px-4 pb-4">
            <Button variant="outline" onClick={() => setLightboxOpen(false)}>Chiudi</Button>
            <Button
              onClick={() => { if (lightboxPhoto) { togglePhotoSelection(lightboxPhoto.id); setLightboxOpen(false); } }}
              disabled={!lightboxPhoto}
              variant={lightboxPhoto && selectedPhotos.has(lightboxPhoto.id) ? "destructive" : "default"}
            >
              {lightboxPhoto && selectedPhotos.has(lightboxPhoto.id) ? 'Deseleziona' : 'Seleziona Foto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

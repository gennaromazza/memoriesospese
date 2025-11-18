import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, Star, Image, Grid3x3, Loader2, Maximize2 } from 'lucide-react';
import Lightbox from '@/components/public/Lightbox';

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

const JOB_TYPES = [
  { value: 'matrimonio', label: 'Matrimonio' },
  { value: 'battesimo', label: 'Battesimo' },
  { value: 'comunione', label: 'Comunione' },
  { value: 'cresima', label: 'Cresima' },
  { value: 'evento', label: 'Eventi' },
  { value: 'ritratto', label: 'Ritratti' },
  { value: 'famiglia', label: 'Famiglia' },
  { value: 'altro', label: 'Altro' }
];

export default function PortfolioManager() {
  const [selections, setSelections] = useState<PortfolioSelection[]>([]);
  const [galleries, setGalleries] = useState<Gallery[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedGallery, setSelectedGallery] = useState<string>('');
  const [selectedPhoto, setSelectedPhoto] = useState<string>('');
  const [selectedJobType, setSelectedJobType] = useState<string>('matrimonio');
  const [filterJobType, setFilterJobType] = useState<string>('all');
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadSelections();
    loadGalleries();
  }, []);

  const loadSelections = async () => {
    try {
      const q = query(collection(db, 'portfolioSelections'), orderBy('sortOrder', 'asc'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as PortfolioSelection[];
      setSelections(data);
    } catch (error) {
      console.error('Errore caricamento portfolio:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare il portfolio",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadGalleries = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'galleries'));
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Gallery[];
      setGalleries(data.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (error) {
      console.error('Errore caricamento gallerie:', error);
    }
  };

  const loadGalleryPhotos = async (galleryId: string) => {
    setLoadingPhotos(true);
    try {
      const photosRef = collection(db, 'photos');
      const q = query(photosRef, where('galleryId', '==', galleryId));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Photo[];
      setPhotos(data);
    } catch (error) {
      console.error('Errore caricamento foto:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare le foto della galleria",
        variant: "destructive"
      });
    } finally {
      setLoadingPhotos(false);
    }
  };

  const handleGalleryChange = (galleryId: string) => {
    setSelectedGallery(galleryId);
    setSelectedPhoto('');
    if (galleryId) {
      loadGalleryPhotos(galleryId);
    } else {
      setPhotos([]);
    }
  };

  const handleAddToPortfolio = async () => {
    if (!selectedGallery || !selectedPhoto) {
      toast({
        title: "Attenzione",
        description: "Seleziona una galleria e una foto",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      const gallery = galleries.find(g => g.id === selectedGallery);
      const photo = photos.find(p => p.id === selectedPhoto);
      
      if (!gallery || !photo) return;

      const maxSortOrder = selections.length > 0 
        ? Math.max(...selections.map(s => s.sortOrder)) 
        : 0;

      await addDoc(collection(db, 'portfolioSelections'), {
        galleryId: selectedGallery,
        galleryName: gallery.name,
        photoId: selectedPhoto,
        photoUrl: photo.url,
        jobType: selectedJobType,
        featured: false,
        sortOrder: maxSortOrder + 1,
        createdAt: new Date()
      });

      toast({
        title: "Successo",
        description: "Foto aggiunta al portfolio pubblico"
      });

      setAddDialogOpen(false);
      setSelectedGallery('');
      setSelectedPhoto('');
      setPhotos([]);
      loadSelections();
    } catch (error) {
      console.error('Errore aggiunta foto:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiungere la foto al portfolio",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatured = async (selection: PortfolioSelection) => {
    try {
      await updateDoc(doc(db, 'portfolioSelections', selection.id), {
        featured: !selection.featured
      });
      loadSelections();
      toast({
        title: "Aggiornato",
        description: selection.featured ? "Rimossa da foto in evidenza" : "Aggiunta a foto in evidenza"
      });
    } catch (error) {
      console.error('Errore aggiornamento:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare la foto",
        variant: "destructive"
      });
    }
  };

  const removeFromPortfolio = async (selectionId: string) => {
    if (!confirm('Rimuovere questa foto dal portfolio pubblico?')) return;

    try {
      await deleteDoc(doc(db, 'portfolioSelections', selectionId));
      loadSelections();
      toast({
        title: "Rimossa",
        description: "Foto rimossa dal portfolio pubblico"
      });
    } catch (error) {
      console.error('Errore rimozione:', error);
      toast({
        title: "Errore",
        description: "Impossibile rimuovere la foto",
        variant: "destructive"
      });
    }
  };

  const filteredSelections = filterJobType === 'all' 
    ? selections 
    : selections.filter(s => s.jobType === filterJobType);

  const groupedByCategory = filteredSelections.reduce((acc, sel) => {
    if (!acc[sel.jobType]) acc[sel.jobType] = [];
    acc[sel.jobType].push(sel);
    return acc;
  }, {} as Record<string, PortfolioSelection[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Portfolio Pubblico</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci le foto visibili sul sito pubblico - {selections.length} foto selezionate
          </p>
        </div>
        
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
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
                Seleziona una foto da una galleria esistente per aggiungerla al portfolio pubblico
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Galleria</Label>
                <Select value={selectedGallery} onValueChange={handleGalleryChange}>
                  <SelectTrigger data-testid="select-gallery">
                    <SelectValue placeholder="Seleziona una galleria" />
                  </SelectTrigger>
                  <SelectContent>
                    {galleries.map(gallery => (
                      <SelectItem key={gallery.id} value={gallery.id}>
                        {gallery.name} - {gallery.date} ({gallery.photoCount} foto)
                      </SelectItem>
                    ))}
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
                        {JOB_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Seleziona Foto</Label>
                    {loadingPhotos ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin" />
                      </div>
                    ) : photos.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4">
                        Nessuna foto trovata in questa galleria
                      </p>
                    ) : (
                      <div className="grid grid-cols-3 gap-3 max-h-[500px] overflow-y-auto border rounded-md p-3">
                        {photos.map((photo, index) => (
                          <div
                            key={photo.id}
                            className={`relative group cursor-pointer border-2 rounded-md overflow-hidden transition-all ${
                              selectedPhoto === photo.id 
                                ? 'border-primary ring-2 ring-primary' 
                                : 'border-transparent hover:border-primary/50'
                            }`}
                            data-testid={`photo-option-${photo.id}`}
                          >
                            <div 
                              onClick={() => setSelectedPhoto(photo.id)}
                              className="aspect-square"
                            >
                              <img 
                                src={photo.url} 
                                alt={photo.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            
                            {/* Preview button overlay */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLightboxIndex(index);
                                setLightboxOpen(true);
                              }}
                              className="absolute top-2 right-2 p-2 bg-black/60 hover:bg-black/80 text-white rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Anteprima a schermo intero"
                            >
                              <Maximize2 className="h-4 w-4" />
                            </button>

                            {/* Selected indicator */}
                            {selectedPhoto === photo.id && (
                              <div className="absolute top-2 left-2 bg-primary text-white px-2 py-1 rounded-md text-xs font-medium">
                                Selezionata
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                Annulla
              </Button>
              <Button 
                onClick={handleAddToPortfolio} 
                disabled={!selectedPhoto || saving}
                data-testid="button-confirm-add-photo"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aggiunta...
                  </>
                ) : (
                  'Aggiungi al Portfolio'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 items-center">
        <Label>Filtra per categoria:</Label>
        <Select value={filterJobType} onValueChange={setFilterJobType}>
          <SelectTrigger className="w-48" data-testid="filter-job-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le categorie</SelectItem>
            {JOB_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {Object.keys(groupedByCategory).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Nessuna foto nel portfolio pubblico. Clicca "Aggiungi Foto" per iniziare.
            </p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedByCategory).map(([jobType, items]) => (
          <Card key={jobType}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Grid3x3 className="h-5 w-5" />
                {JOB_TYPES.find(t => t.value === jobType)?.label || jobType}
                <Badge variant="secondary">{items.length} foto</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {items.map(selection => (
                  <div key={selection.id} className="relative group">
                    <img
                      src={selection.photoUrl}
                      alt={selection.galleryName}
                      className="w-full h-32 object-cover rounded-md"
                      data-testid={`portfolio-photo-${selection.id}`}
                    />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center gap-2">
                      <Button
                        size="sm"
                        variant={selection.featured ? "default" : "secondary"}
                        onClick={() => toggleFeatured(selection)}
                        data-testid={`button-toggle-featured-${selection.id}`}
                      >
                        <Star className={`h-4 w-4 ${selection.featured ? 'fill-current' : ''}`} />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeFromPortfolio(selection.id)}
                        data-testid={`button-remove-${selection.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {selection.featured && (
                      <Badge className="absolute top-2 left-2 bg-yellow-500">
                        <Star className="h-3 w-3 mr-1 fill-current" />
                        Featured
                      </Badge>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {selection.galleryName}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Lightbox per preview foto */}
      <Lightbox
        images={photos.map(p => p.url)}
        currentIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onNext={() => setLightboxIndex(prev => Math.min(prev + 1, photos.length - 1))}
        onPrevious={() => setLightboxIndex(prev => Math.max(prev - 1, 0))}
      />
    </div>
  );
}

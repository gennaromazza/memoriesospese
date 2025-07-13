import { useState, useEffect } from 'react';
import { collection, getDocs, doc, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { useToast } from "../hooks/use-toast";
import { 
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle 
} from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import FileUpload, { PhotoWithChapter } from "./ui/file-upload";

interface SlideshowImage {
  id: string;
  url: string;
  alt: string;
  active: boolean;
  position: number;
}

export default function SlideshowManager() {
  const [images, setImages] = useState<SlideshowImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    fetchSlideshowImages();
  }, []);

  async function fetchSlideshowImages() {
    try {
      setIsLoading(true);
      
      // Controlla se la collezione esiste
      let fetchedImages: SlideshowImage[] = [];
      const slideshowCollection = collection(db, 'slideshow');
      
      try {
        // Prima prova a ottenere qualsiasi documento dalla collezione
        const initialSnapshot = await getDocs(slideshowCollection);
        
        if (!initialSnapshot.empty) {
          // Se ci sono documenti, esegui la query con orderBy
          const slideshowQuery = query(slideshowCollection, orderBy('position'));
          const querySnapshot = await getDocs(slideshowQuery);
          
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            fetchedImages.push({
              id: doc.id,
              url: data.url,
              alt: data.alt || '',
              active: data.active || false,
              position: data.position || 0
            });
          });
        } else {
          
        }
      } catch (queryError) {
        
      }
      
      setImages(fetchedImages);
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile caricare le immagini dello slideshow."
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };
  
  const handleFilesSelected = (files: File[] | PhotoWithChapter[]) => {
    if (files.length > 0) {
      setFile(files[0] as File);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Seleziona un'immagine da caricare."
      });
      return;
    }

    try {
      setIsUploading(true);

      // Carica l'immagine su Firebase Storage
      const storageRef = ref(storage, `slideshow/${Date.now()}_${file.name}`);
      const uploadResult = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(uploadResult.ref);

      // Salva i metadati in Firestore
      const slideshowCollection = collection(db, 'slideshow');
      await addDoc(slideshowCollection, {
        url: downloadURL,
        alt: altText || file.name,
        active: true,
        position: images.length,
        createdAt: new Date()
      });

      toast({
        title: "Successo",
        description: "Immagine caricata correttamente."
      });

      // Aggiorna la lista delle immagini
      setFile(null);
      setAltText('');
      fetchSlideshowImages();
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile caricare l'immagine."
      });
    } finally {
      setIsUploading(false);
    }
  };

  const toggleImageActive = async (image: SlideshowImage) => {
    try {
      const docRef = doc(db, 'slideshow', image.id);
      await updateDoc(docRef, {
        active: !image.active
      });

      // Aggiorna lo stato locale
      setImages(images.map(img => 
        img.id === image.id ? { ...img, active: !img.active } : img
      ));

      toast({
        title: "Stato aggiornato",
        description: `Immagine ${!image.active ? 'attivata' : 'disattivata'}.`
      });
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile aggiornare lo stato dell'immagine."
      });
    }
  };

  const moveImage = async (image: SlideshowImage, direction: 'up' | 'down') => {
    const currentIndex = images.findIndex(img => img.id === image.id);
    if (
      (direction === 'up' && currentIndex === 0) || 
      (direction === 'down' && currentIndex === images.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const swapImage = images[newIndex];

    try {
      // Aggiorna le posizioni in Firestore
      const imageDocRef = doc(db, 'slideshow', image.id);
      const swapImageDocRef = doc(db, 'slideshow', swapImage.id);

      await updateDoc(imageDocRef, { position: newIndex });
      await updateDoc(swapImageDocRef, { position: currentIndex });

      // Aggiorna l'array locale
      const newImages = [...images];
      newImages[currentIndex] = { ...newImages[currentIndex], position: newIndex };
      newImages[newIndex] = { ...newImages[newIndex], position: currentIndex };
      newImages.sort((a, b) => a.position - b.position);
      
      setImages(newImages);
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile riordinare le immagini."
      });
    }
  };

  const deleteImage = async (image: SlideshowImage) => {
    if (!confirm('Sei sicuro di voler eliminare questa immagine?')) {
      return;
    }

    try {
      // Elimina il documento da Firestore
      await deleteDoc(doc(db, 'slideshow', image.id));

      // Estrai il percorso dell'immagine dall'URL
      const urlParts = image.url.split('?')[0].split('/');
      const storagePath = urlParts[urlParts.length - 1].replace(/%2F/g, '/');
      const imageRef = ref(storage, `slideshow/${storagePath.split('/').pop()}`);
      
      // Prova a eliminare l'immagine da Storage
      try {
        await deleteObject(imageRef);
      } catch (storageError) {
        
      }

      // Aggiorna la lista locale
      setImages(images.filter(img => img.id !== image.id));
      
      toast({
        title: "Immagine eliminata",
        description: "L'immagine è stata rimossa dallo slideshow."
      });
    } catch (error) {
      
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Impossibile eliminare l'immagine."
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Gestione Slideshow Homepage</CardTitle>
          <CardDescription>
            Carica, ordina e gestisci le immagini che verranno mostrate nella sezione principale della homepage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="image">Seleziona immagine</Label>
                <div className="mt-1">
                  <FileUpload
                    onFilesSelected={handleFilesSelected}
                    multiple={false}
                    maxFiles={1}
                    accept="image/*"
                    currentFiles={file ? [file] : []}
                    onRemoveFile={() => setFile(null)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="alt-text">Testo alternativo</Label>
                <Input
                  id="alt-text"
                  type="text"
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  placeholder="Descrizione dell'immagine"
                  className="mt-1"
                />
              </div>
            </div>
            <Button 
              onClick={handleUpload} 
              disabled={!file || isUploading}
              className="w-full md:w-auto"
            >
              {isUploading ? 'Caricamento in corso...' : 'Carica immagine'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        <h3 className="text-xl font-semibold">Immagini correnti</h3>
        
        {isLoading ? (
          <p>Caricamento immagini...</p>
        ) : images.length === 0 ? (
          <p>Nessuna immagine caricata. Aggiungi immagini per creare uno slideshow nella homepage.</p>
        ) : (
          <div className="space-y-4">
            {images.map((image, index) => (
              <Card key={image.id}>
                <div className="flex flex-col md:flex-row">
                  <div className="w-full md:w-48 h-48 relative">
                    <img 
                      src={image.url} 
                      alt={image.alt}
                      className="w-full h-full object-cover rounded-t-md md:rounded-l-md md:rounded-t-none"
                    />
                  </div>
                  <div className="flex-1 p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-medium">{image.alt || 'Immagine senza descrizione'}</h4>
                        <p className="text-sm text-gray-500">Posizione: {index + 1}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Label htmlFor={`active-${image.id}`} className="text-sm mr-2">
                          {image.active ? 'Attiva' : 'Disattivata'}
                        </Label>
                        <Switch
                          id={`active-${image.id}`}
                          checked={image.active}
                          onCheckedChange={() => toggleImageActive(image)}
                        />
                      </div>
                    </div>
                    
                    <Separator className="my-3" />
                    
                    <div className="flex space-x-2 justify-between">
                      <div className="space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => moveImage(image, 'up')}
                          disabled={index === 0}
                        >
                          ↑
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => moveImage(image, 'down')}
                          disabled={index === images.length - 1}
                        >
                          ↓
                        </Button>
                      </div>
                      <Button 
                        variant="destructive" 
                        size="sm"
                        onClick={() => deleteImage(image)}
                      >
                        Elimina
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
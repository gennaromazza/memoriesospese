import { useState, useEffect } from 'react';
import { useLocation, useRoute, Link } from 'wouter';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';
import { FloralCorner, FloralDivider, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage, DecorativeImage } from '@/components/WeddingImages';
import { createUrl } from '@/lib/basePath';

export default function PasswordResult() {
  const [, params] = useRoute('/password-result/:code');
  const [loading, setLoading] = useState(true);
  const [gallery, setGallery] = useState<any>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    async function fetchGallery() {
      if (!params?.code) {
        navigate(createUrl('/'));
        return;
      }

      setLoading(true);
      try {
        // Cerca la galleria usando l'ID
        const galleriesRef = collection(db, 'galleries');
        const galleryDoc = doc(galleriesRef, params.code);
        const gallerySnap = await getDoc(galleryDoc);

        if (gallerySnap.exists()) {
          setGallery({
            id: gallerySnap.id,
            ...gallerySnap.data()
          });
        } else {
          

          // Se non troviamo per ID, proviamo a cercare per codice galleria
          const q = query(galleriesRef, where('code', '==', params.code));
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const galleryData = querySnapshot.docs[0];
            setGallery({
              id: galleryData.id,
              ...galleryData.data()
            });
          } else {
            toast({
              title: 'Errore',
              description: 'Galleria non trovata',
              variant: 'destructive'
            });
            navigate(createUrl('/'));
          }
        }
      } catch (error) {
        
        toast({
          title: 'Errore',
          description: 'Si è verificato un errore nel recupero della galleria',
          variant: 'destructive'
        });
      } finally {
        setLoading(false);
      }
    }

    fetchGallery();
  }, [params?.code, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-off-white relative">
        {/* Decorazioni */}
        <div className="absolute top-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="top-left" />
        </div>
        <div className="absolute top-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="top-right" />
        </div>
        <div className="absolute bottom-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="bottom-left" />
        </div>
        <div className="absolute bottom-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="bottom-right" />
        </div>

        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-6 border-4 border-sage border-t-transparent rounded-full animate-spin"></div>
            <h2 className="text-2xl font-semibold text-blue-gray font-playfair">Caricamento informazioni galleria...</h2>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-off-white relative">
        {/* Decorazioni */}
        <div className="absolute top-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="top-left" />
        </div>
        <div className="absolute top-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="top-right" />
        </div>
        <div className="absolute bottom-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="bottom-left" />
        </div>
        <div className="absolute bottom-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
          <FloralCorner position="bottom-right" />
        </div>

        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
          <div className="text-center">
            <div className="w-36 h-36 mx-auto mb-6">
              <WeddingImage type="heart-balloon" className="w-full h-auto opacity-40" alt="Immagine decorativa di sposi" />
            </div>
            <h2 className="text-2xl font-semibold text-blue-gray font-playfair">Galleria non trovata</h2>
            <p className="mt-2 text-gray-600">La galleria richiesta non esiste o è stata rimossa.</p>
            <div className="w-full max-w-xs mx-auto h-8 opacity-20 my-6">
              <FloralDivider />
            </div>
            <div className="mt-6">
              <Link href={createUrl('/')}>
                <Button className="btn-primary relative group overflow-hidden">
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity">
                    <BackgroundDecoration />
                  </span>
                  <span className="relative z-10">Torna alla Home</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white relative">
      {/* Decorazioni */}
      <div className="absolute top-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="top-left" />
      </div>
      <div className="absolute top-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="top-right" />
      </div>
      <div className="absolute bottom-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="bottom-left" />
      </div>
      <div className="absolute bottom-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="bottom-right" />
      </div>

      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 relative z-10">
        <div className="max-w-lg mx-auto bg-white shadow-lg rounded-lg overflow-hidden border border-sage/20 relative">
          <div className="absolute inset-0 opacity-5 pointer-events-none">
            <BackgroundDecoration />
          </div>
          <div className="px-6 py-8 relative z-10">
            <div className="text-center mb-8">
              <div className="w-40 h-40 mx-auto mb-6">
                <WeddingImage type="flower-bouquet" className="w-full h-auto opacity-60" alt="Immagine decorativa con fiori" />
              </div>
              <h2 className="text-2xl font-semibold text-blue-gray font-playfair">Accesso alla Galleria</h2>
              <p className="mt-2 text-gray-600">Ecco le informazioni di accesso per la galleria richiesta</p>
              <div className="w-full max-w-xs mx-auto h-8 opacity-20 my-6">
                <FloralDivider />
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-cream/30 p-5 rounded-md border border-sage/10">
                <h3 className="text-lg font-medium text-blue-gray font-playfair">Informazioni Galleria</h3>
                <div className="mt-4 grid grid-cols-1 gap-4 divide-y divide-sage/10">
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Nome galleria:</span>
                    <span className="font-medium text-blue-gray">{gallery.name}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Data evento:</span>
                    <span className="font-medium text-blue-gray">{gallery.date}</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-gray-600 mb-2">Password:</span>
                    <div className="mx-auto">
                      <span className="font-mono bg-light-mint px-4 py-2 rounded-md font-bold text-lg text-blue-gray border-2 border-sage shadow-md block text-center tracking-wide">{gallery.password}</span>
                      <p className="text-xs text-gray-500 mt-2 text-center">Usa questa password per accedere alla galleria</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4 pt-4">
                <Link href={createUrl(`/gallery/${gallery.code}`)}>
                  <Button className="w-full sm:w-auto btn-primary relative group overflow-hidden">
                    <span className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity">
                      <BackgroundDecoration />
                    </span>
                    <span className="relative z-10">Vai alla Galleria</span>
                  </Button>
                </Link>
                <Link href={createUrl('/')}>
                  <Button variant="outline" className="w-full sm:w-auto">Torna alla Home</Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
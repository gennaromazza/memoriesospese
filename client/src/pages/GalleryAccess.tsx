import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "wouter";
import { useToast } from "../hooks/use-toast";
import { createUrl } from "@/lib/basePath";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import Navigation from "../components/Navigation";
import Footer from "../components/Footer";
import { Lock } from "lucide-react";

export default function GalleryAccess() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [galleryNotFound, setGalleryNotFound] = useState(false);
  const [galleryDetails, setGalleryDetails] = useState<{ name: string; date: string; location: string } | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [password, setPassword] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const { toast } = useToast();

  // Check if gallery exists on component mount
  useEffect(() => {
    async function checkGallery() {
      if (!id) return;

      setIsLoading(true);
      try {
        const galleriesRef = collection(db, "galleries");
        
        // Cerca prima per "code" (gallerie nuove)
        let q = query(galleriesRef, where("code", "==", id));
        let querySnapshot = await getDocs(q);

        // Se non trova per code, cerca per ID Firestore (gallerie vecchie)
        if (querySnapshot.empty) {
          const { doc, getDoc } = await import("firebase/firestore");
          const docRef = doc(db, "galleries", id);
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            const galleryData = docSnapshot.data();
            setGalleryDetails({ 
              name: galleryData.name,
              date: galleryData.date,
              location: galleryData.location
            });
          } else {
            setGalleryNotFound(true);
          }
        } else {
          const galleryData = querySnapshot.docs[0].data();
          setGalleryDetails({ 
            name: galleryData.name,
            date: galleryData.date,
            location: galleryData.location
          });
        }
      } catch (error) {
        toast({
          title: "Errore",
          description: "Non è stato possibile verificare la galleria.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    checkGallery();
  }, [id, toast]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !password) return;

    setIsValidating(true);
    try {
      // Salva password in localStorage per accesso galleria
      localStorage.setItem(`gallery_password_${id}`, password);
      
      // Naviga direttamente alla galleria - Gallery.tsx gestirà validazione
      navigate(createUrl(`/gallery/${id}`));
    } catch (error) {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'accesso.",
        variant: "destructive",
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleAccessGranted = () => {
    if (!id) return;

    // Store session and navigate to gallery view
    localStorage.setItem(`gallery_auth_${id}`, "true");
    setAccessGranted(true);

    // Navigate to gallery view
    navigate(createUrl(`/view/${id}`));
  };

  return (
    <div className="min-h-screen bg-off-white flex flex-col">
      <Navigation />

      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {galleryNotFound ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-blue-gray font-playfair mb-4">
                    Galleria non trovata
                  </h2>
                  <p className="text-gray-600 mb-6">
                    La galleria che stai cercando non esiste o è stata rimossa.
                  </p>
                  <Link href={createUrl("/")}>
                    <Button className="btn-primary">Torna alla Home</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Gallery header with details */}
              <div className="text-center">
                <div className="inline-block p-3 rounded-full bg-light-mint mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-blue-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-blue-gray font-playfair">
                  {galleryDetails?.name || "Accedi alla Galleria"}
                </h2>
                {galleryDetails?.date && galleryDetails?.location && (
                  <p className="mt-2 text-gray-600">
                    {galleryDetails.date} • {galleryDetails.location}
                  </p>
                )}
                <div className="mt-4 pt-4 border-t border-beige">
                  <p className="text-gray-600">
                    Questa galleria è protetta. Completa l'autenticazione per accedere alle foto.
                  </p>
                </div>
              </div>

              {/* Password Form */}
              {id && !accessGranted && (
                <Card>
                  <CardContent className="pt-6">
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                          Password della Galleria
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                          <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Inserisci la password"
                            className="pl-10"
                            disabled={isValidating}
                            required
                            data-testid="input-gallery-password"
                          />
                        </div>
                      </div>
                      <Button 
                        type="submit" 
                        className="w-full btn-primary" 
                        disabled={isValidating}
                        data-testid="button-submit-password"
                      >
                        {isValidating ? "Verifica..." : "Accedi alla Galleria"}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              )}

              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">
                  Non hai la password per questa galleria?
                </p>
                <Link href={createUrl(`/request-password/${id}`)} className="inline-block px-4 py-2 rounded text-blue-gray hover:text-terracotta transition">
                  Richiedila qui
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
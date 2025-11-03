import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "wouter";
import { useToast } from "../hooks/use-toast";
import { createUrl } from "@/lib/basePath";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import Navigation from "../components/Navigation";
import Footer from "../components/Footer";
import { Lock, Mail, Eye, EyeOff } from "lucide-react";

interface GalleryData {
  id: string;
  name: string;
  date: string;
  location: string;
  hasPassword: boolean; // Flag per sapere se galleria ha password (NO password in chiaro!)
  specialPin?: string;
  specialTheme?: string;
}

export default function GalleryAccess() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [galleryNotFound, setGalleryNotFound] = useState(false);
  const [galleryDetails, setGalleryDetails] = useState<GalleryData | null>(null);
  const [accessGranted, setAccessGranted] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
          const docRef = doc(db, "galleries", id);
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            const galleryData = docSnapshot.data();
            const docId = docSnapshot.id;
            // SICUREZZA: usa hasPassword flag boolean dal documento (NO lettura password in chiaro)
            // BACKWARD COMPATIBILITY: se hasPassword non esiste, controlla se c'è il vecchio campo password
            const hasPassword = galleryData.hasPassword === true || !!galleryData.password;
            const hasSpecialPin = !!galleryData.specialTheme; // Se ha tema, probabilmente ha PIN
            
            setGalleryDetails({ 
              id: docId,
              name: galleryData.name,
              date: galleryData.date,
              location: galleryData.location,
              hasPassword: hasPassword,
              specialTheme: galleryData.specialTheme
            });

            // Se la galleria non ha password E non ha tema (quindi no PIN), accesso diretto
            if (!hasPassword && !hasSpecialPin) {
              localStorage.setItem(`gallery_auth_${id}`, "true");
              navigate(createUrl(`/view/${id}`));
            }
          } else {
            setGalleryNotFound(true);
          }
        } else {
          const docId = querySnapshot.docs[0].id;
          const galleryData = querySnapshot.docs[0].data();
          // SICUREZZA: usa hasPassword flag boolean dal documento (NO lettura password in chiaro)
          // BACKWARD COMPATIBILITY: se hasPassword non esiste, controlla se c'è il vecchio campo password
          const hasPassword = galleryData.hasPassword === true || !!galleryData.password;
          const hasSpecialPin = !!galleryData.specialTheme; // Se ha tema, probabilmente ha PIN
          
          setGalleryDetails({ 
            id: docId,
            name: galleryData.name,
            date: galleryData.date,
            location: galleryData.location,
            hasPassword: hasPassword,
            specialTheme: galleryData.specialTheme
          });

          // Se la galleria non ha password E non ha tema (quindi no PIN), accesso diretto
          if (!hasPassword && !hasSpecialPin) {
            localStorage.setItem(`gallery_auth_${id}`, "true");
            navigate(createUrl(`/view/${id}`));
          }
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
  }, [id, toast, navigate]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!id || !galleryDetails) return;

    // Reset error
    setPasswordError("");

    // Validate password
    if (!passwordInput.trim()) {
      setPasswordError("Inserisci la password");
      return;
    }

    setIsLoading(true);

    try {
      // Verifica password SERVER-SIDE (sicuro!)
      const response = await fetch('/api/email/verify-gallery-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          galleryId: galleryDetails.id,
          password: passwordInput.trim()
        }),
      });

      const data = await response.json();

      if (response.ok && data.result?.valid) {
        // Password corretta - salva sessione e naviga
        localStorage.setItem(`gallery_auth_${id}`, "true");
        toast({
          title: "Accesso consentito!",
          description: "Benvenuto nella galleria",
        });
        navigate(createUrl(`/view/${id}`));
      } else {
        // Password errata
        setPasswordError("Password non corretta");
        setPasswordInput("");
      }
    } catch (error) {
      console.error('Errore verifica password:', error);
      toast({
        title: "Errore",
        description: "Impossibile verificare la password. Riprova.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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

              {/* Form Inserimento Password */}
              {id && !accessGranted && galleryDetails && (
                <Card>
                  <CardContent className="pt-6">
                    <form onSubmit={handlePasswordSubmit} className="space-y-4">
                      <div>
                        <label htmlFor="password" className="block text-sm font-medium text-blue-gray mb-2 flex items-center gap-2">
                          <Lock className="w-4 h-4" />
                          Password Galleria
                        </label>
                        <div className="relative">
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={passwordInput}
                            onChange={(e) => {
                              setPasswordInput(e.target.value);
                              setPasswordError("");
                            }}
                            placeholder="Inserisci la password"
                            className="w-full pr-10"
                            autoFocus
                            data-testid="input-gallery-password"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 transition-colors"
                            data-testid="button-toggle-password-visibility"
                          >
                            {showPassword ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        {passwordError && (
                          <p className="mt-1 text-sm text-red-500">{passwordError}</p>
                        )}
                      </div>

                      <Button
                        type="submit"
                        className="btn-primary w-full"
                        disabled={isLoading}
                        data-testid="button-submit-password"
                      >
                        {isLoading ? "Verifica..." : "Accedi"}
                      </Button>
                    </form>

                    <div className="my-6 relative">
                      <Separator />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-white px-4 text-sm text-gray-500">oppure</span>
                      </div>
                    </div>

                    <div className="text-center space-y-3">
                      <p className="text-sm text-gray-600">
                        Non hai la password?
                      </p>
                      <Link href={createUrl(`/request-password/${id}`)}>
                        <Button variant="outline" className="w-full" data-testid="button-request-password">
                          <Mail className="w-4 h-4 mr-2" />
                          Richiedi Password via Email
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
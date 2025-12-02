import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Link } from "wouter";
import { useToast } from "../hooks/use-toast";
import { createUrl } from "@/lib/basePath";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Separator } from "../components/ui/separator";
import Navigation from "../components/Navigation";
import Footer from "../components/Footer";
import { Lock, Mail, Eye, EyeOff, Loader2, ArrowLeft } from "lucide-react";
import { Label } from "../components/ui/label";
import { useIsAdmin } from "@/hooks/useIsAdmin";

interface GalleryData {
  id: string;
  name: string;
  date: string;
  location: string;
  hasPassword: boolean; // Flag per sapere se galleria ha password (NO password in chiaro!)
  specialPin?: string;
  specialTheme?: string;
}

// Interface for gallery data fetched from backend
interface Gallery {
  id: string;
  clientName: string;
  eventDate: string;
  location: string;
  photos: string[]; // Assuming photos are stored as an array of URLs or IDs
  password?: string; // Only for internal use if needed, not exposed directly
  hasPassword: boolean;
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
  const isAdmin = useIsAdmin();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempting, setAttempting] = useState(false); // Renamed from 'attempting' to 'isLoading' for consistency
  const [authAttempts, setAuthAttempts] = useState(0);

  // Re-encode galleryId for the request password link
  const encodedGalleryId = id ? btoa(id) : null;

  // 🔐 ADMIN BYPASS: Se l'utente è admin, salta la password e vai direttamente alla galleria
  useEffect(() => {
    if (isAdmin && id) {
      console.log('✅ Admin bypass in GalleryAccess: accesso diretto alla galleria', id);
      localStorage.setItem(`gallery_auth_${id}`, "true");
      navigate(createUrl(`/view/${id}`), { replace: true });
    }
  }, [isAdmin, id, navigate]);

  // Check if gallery exists on component mount
  useEffect(() => {
    async function checkGallery() {
      // Se è admin, non fare nulla - il bypass gestisce il redirect
      if (isAdmin) {
        return;
      }
      
      if (!id) {
        setError("ID galleria non specificato.");
        setLoading(false);
        return;
      }

      setLoading(true); // Use setLoading for the initial check
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

            // CRITICAL: Gallerie con tema speciale (PIN) SOLO accessibili da /special-gallery
            if (galleryData.specialTheme) {
              console.log('🔒 Galleria con tema speciale rilevata - redirect a /special-gallery');
              navigate(createUrl('/special-gallery'));
              return;
            }

            // SICUREZZA: usa hasPassword flag boolean dal documento (NO lettura password in chiaro)
            // BACKWARD COMPATIBILITY: se hasPassword non esiste, controlla se c'è il vecchio campo password
            const hasPassword = galleryData.hasPassword === true || !!galleryData.password;

            setGalleryDetails({
              id: docId,
              name: galleryData.name,
              date: galleryData.date,
              location: galleryData.location,
              hasPassword: hasPassword,
              specialTheme: undefined // Non deve avere tema qui
            });

            // If the gallery does not have a password, grant direct access
            if (!hasPassword) {
              localStorage.setItem(`gallery_auth_${id}`, "true");
              navigate(createUrl(`/view/${id}`));
            }
          } else {
            setGalleryNotFound(true);
            setError("Galleria non trovata.");
          }
        } else {
          const docId = querySnapshot.docs[0].id;
          const galleryData = querySnapshot.docs[0].data();

          // CRITICAL: Gallerie con tema speciale (PIN) SOLO accessibili da /special-gallery
          if (galleryData.specialTheme) {
            console.log('🔒 Galleria con tema speciale rilevata - redirect a /special-gallery');
            navigate(createUrl('/special-gallery'));
            return;
          }

          // SICUREZZA: usa hasPassword flag boolean dal documento (NO lettura password in chiaro)
          // BACKWARD COMPATIBILITY: se hasPassword non esiste, controlla se c'è il vecchio campo password
          const hasPassword = galleryData.hasPassword === true || !!galleryData.password;

          setGalleryDetails({
            id: docId,
            name: galleryData.name,
            date: galleryData.date,
            location: galleryData.location,
            hasPassword: hasPassword,
            specialTheme: undefined // Non deve avere tema qui
          });

          // Se la galleria non ha password, accesso diretto
          if (!hasPassword) {
            localStorage.setItem(`gallery_auth_${id}`, "true");
            navigate(createUrl(`/view/${id}`));
          }
        }
      } catch (e) {
        console.error("Errore durante il recupero dei dettagli della galleria:", e);
        setError("Impossibile recuperare i dettagli della galleria. Riprova più tardi.");
        toast({
          title: "Errore",
          description: "Non è stato possibile verificare la galleria.",
          variant: "destructive",
        });
      } finally {
        setLoading(false); // Use setLoading for the initial check
      }
    }

    checkGallery();
  }, [id, toast, navigate, isAdmin]);

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

    setAttempting(true); // Use setAttempting for password submission

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
        setAuthAttempts(authAttempts + 1); // Increment attempts
      }
    } catch (error) {
      console.error('Errore verifica password:', error);
      setError("Impossibile verificare la password. Riprova.");
      toast({
        title: "Errore",
        description: "Impossibile verificare la password. Riprova.",
        variant: "destructive",
      });
    } finally {
      setAttempting(false); // Use setAttempting for password submission
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
        <div className="text-center px-4">
          <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin text-sage mx-auto mb-4" />
          <p className="text-base sm:text-lg text-gray-600">Caricamento galleria...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-white to-[#F5EFE6] px-4">
        <Card className="w-full max-w-md shadow-xl border-sage/10">
          <CardHeader>
            <CardTitle className="text-xl sm:text-2xl text-red-600">Errore</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base sm:text-lg text-gray-700">{error}</p>
            <Link href="/">
              <Button variant="outline" className="w-full border-sage text-sage hover:bg-sage/10">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Torna alla Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-beige">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-xl sm:text-2xl font-playfair text-blue-gray">
              iMaGe <span className="text-sage">Studio</span>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-sage hover:text-dark-sage text-sm sm:text-base">
                <ArrowLeft className="mr-2 h-4 w-4" />
                <span className="hidden sm:inline">Torna alla </span>Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-28 md:pt-32 pb-8 sm:pb-12 md:pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 bg-sage rounded-full mb-4 sm:mb-6">
            <Lock className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-playfair text-blue-gray mb-4 sm:mb-6 leading-tight px-4">
            {galleryDetails?.name || 'Galleria'}
          </h1>
          {galleryDetails?.date && (
            <p className="text-lg sm:text-xl text-gray-600 mb-3 sm:mb-4">
              {galleryDetails.date}
            </p>
          )}
          {galleryDetails?.location && (
            <p className="text-base sm:text-lg text-gray-500">
              {galleryDetails.location}
            </p>
          )}
        </div>
      </section>

      {/* Access Card */}
      <section className="pb-12 sm:pb-16 px-4">
        <div className="max-w-md mx-auto">
          <Card className="shadow-xl border-sage/10 bg-white rounded-2xl">
            <CardHeader className="space-y-3 sm:space-y-4">
              <CardTitle className="text-xl sm:text-2xl font-playfair text-center text-blue-gray">
                Questa galleria è protetta
              </CardTitle>
              <CardDescription className="text-center text-base sm:text-lg">
                Completa l'autenticazione per accedere alle foto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6">
              <form onSubmit={handlePasswordSubmit} className="space-y-4 sm:space-y-5">
                <div className="relative space-y-2">
                  <Label htmlFor="password" className="text-sm sm:text-base font-medium">Password Galleria</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        setPasswordError(""); // Clear error on input change
                      }}
                      placeholder="Inserisci la password ricevuta"
                      className="h-11 sm:h-12 text-base border-sage/20 focus:border-sage pr-10"
                      autoFocus
                      data-testid="input-gallery-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-700 transition-colors"
                      data-testid="button-toggle-password-visibility"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="mt-1 text-sm text-red-500" data-testid="password-error">{passwordError}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-sage hover:bg-dark-sage text-white h-11 sm:h-12 text-base sm:text-lg font-medium shadow-md hover:shadow-lg transition-all"
                  disabled={attempting || !passwordInput.trim()}
                  data-testid="button-submit-password"
                >
                  {attempting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 sm:h-5 sm:w-5 animate-spin" />
                      Verifica in corso...
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                      Accedi
                    </>
                  )}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs sm:text-sm uppercase">
                  <span className="bg-white px-3 sm:px-4 text-gray-500 font-medium">oppure</span>
                </div>
              </div>

              <div className="text-center space-y-3 sm:space-y-4">
                <p className="text-sm sm:text-base text-gray-600">
                  Non hai la password?
                </p>
                <Link href={createUrl(`/request-password/${id}`)}>
                  <Button
                    variant="outline"
                    className="w-full border-sage text-sage hover:bg-sage/10 h-11 sm:h-12 text-base"
                    type="button"
                    data-testid="button-request-password"
                  >
                    <Mail className="mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    Richiedi Password via Email
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
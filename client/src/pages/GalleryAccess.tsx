import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { createUrl } from "@/lib/basePath";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";

const accessSchema = z.object({
  password: z.string().min(1, "La password è obbligatoria"),
});

type AccessFormData = z.infer<typeof accessSchema>;

export default function GalleryAccess() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [galleryNotFound, setGalleryNotFound] = useState(false);
  const [galleryDetails, setGalleryDetails] = useState<{ name: string; date: string; location: string } | null>(null);
  const { toast } = useToast();

  const form = useForm<AccessFormData>({
    resolver: zodResolver(accessSchema),
    defaultValues: {
      password: "",
    },
  });

  // Check if gallery exists on component mount
  useEffect(() => {
    async function checkGallery() {
      if (!id) return;

      setIsLoading(true);
      try {
        const galleriesRef = collection(db, "galleries");
        const q = query(galleriesRef, where("code", "==", id));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setGalleryNotFound(true);
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
  }, [id]);

  const onSubmit = async (data: AccessFormData) => {
    if (!id) return;

    setIsLoading(true);
    try {
      const galleriesRef = collection(db, "galleries");
      const q = query(
        galleriesRef, 
        where("code", "==", id),
        where("password", "==", data.password)
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        toast({
          title: "Accesso negato",
          description: "La password inserita non è corretta.",
          variant: "destructive",
        });
        return;
      }

      // Successful login, store session and navigate to gallery view
      const galleryDoc = querySnapshot.docs[0];
      localStorage.setItem(`gallery_auth_${id}`, "true");
      localStorage.setItem(`gallery_id_${id}`, galleryDoc.id);
      
      // Naviga alla visualizzazione della galleria usando il router wouter
      // che gestirà correttamente il basePath
      
      navigate(`/view/${id}`);
    } catch (error) {
      
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'accesso alla galleria.",
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
            <Card>
              <CardContent className="pt-6">
                {/* Gallery header with details */}
                <div className="text-center mb-6">
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
                      Questa galleria è protetta. Inserisci la password per accedere alle foto.
                    </p>
                  </div>
                </div>

                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-blue-gray mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <Input
                        id="password"
                        type="text" 
                        placeholder="Inserisci la password"
                        {...form.register("password")}
                        className="w-full px-3 py-2 border border-beige rounded-md focus:ring-sage focus:border-sage"
                        autoFocus
                      />
                    </div>
                    {form.formState.errors.password && (
                      <p className="mt-1 text-sm text-red-500">{form.formState.errors.password.message}</p>
                    )}
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full btn-primary py-2 rounded-md"
                    disabled={isLoading}
                  >
                    {isLoading ? "Verifica in corso..." : "Accedi alla Galleria"}
                  </Button>
                </form>

                <div className="mt-6 pt-4 border-t border-beige text-center">
                  <p className="text-sm text-gray-600 mb-2">
                    Non hai la password per questa galleria?
                  </p>
                  <Link href={createUrl(`/request-password/${id}`)} className="inline-block px-4 py-2 rounded text-blue-gray hover:text-terracotta transition">
                    Richiedila qui
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
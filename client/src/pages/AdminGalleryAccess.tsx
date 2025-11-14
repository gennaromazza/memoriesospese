import { useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useFirebaseAuth } from "@/context/FirebaseAuthContext";
import { createUrl } from "@/lib/basePath";
import Gallery from "./Gallery";
import { Loader2 } from "lucide-react";

/**
 * AdminGalleryAccess - Accesso diretto admin alle gallerie
 * 
 * Questa rotta permette agli admin di accedere direttamente alle gallerie
 * senza dover inserire la password, utile per le notifiche dei commenti.
 * 
 * Route: /admin/galleries/:galleryId
 */
export default function AdminGalleryAccess() {
  const { galleryId } = useParams();
  const [, navigate] = useLocation();
  const { user, isLoading: authLoading } = useFirebaseAuth();
  const isAdmin = useIsAdmin();

  // authReady: verifica che auth sia completata E user sia presente
  const authReady = !authLoading && !!user;

  useEffect(() => {
    // SICUREZZA: Aspetta che l'autenticazione sia completata
    if (authLoading) return;

    // SICUREZZA: Se non c'è utente autenticato, redirect al login
    if (!user) {
      console.warn('🚫 Accesso non autenticato - redirect al login admin');
      navigate(createUrl('/admin'));
      return;
    }

    // SICUREZZA: Se l'utente non è admin, redirect al login admin
    if (!isAdmin) {
      console.warn('🚫 Utente autenticato ma non admin - redirect al login');
      navigate(createUrl('/admin'));
      return;
    }

    // ✅ Admin verificato: bypassa autenticazione password galleria
    if (galleryId) {
      console.log('✅ Admin verificato - accesso diretto alla galleria:', galleryId);
      localStorage.setItem(`gallery_auth_${galleryId}`, "true");
    }
  }, [galleryId, isAdmin, authLoading, user, navigate]);

  // Mostra loader durante verifica autenticazione
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-[#8b5a3c]" />
          <p className="text-gray-600">Verifica autorizzazioni...</p>
        </div>
      </div>
    );
  }

  // SICUREZZA: Blocca accesso se non c'è user o non è admin
  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-[#8b5a3c]" />
          <p className="text-gray-600">Reindirizzamento...</p>
        </div>
      </div>
    );
  }

  // ✅ Admin verificato e auth ready: mostra la galleria direttamente
  return <Gallery />;
}

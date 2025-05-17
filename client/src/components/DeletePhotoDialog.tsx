import { useState } from "react";
import { PhotoWithChapter } from "./ChaptersManager";
import { deleteDoc, doc, collection, query, where, getDocs } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

interface DeletePhotoDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  photo: PhotoWithChapter | null;
  galleryId: string;
  onPhotoDeleted: (photoId: string) => void;
}

export default function DeletePhotoDialog({
  isOpen,
  onOpenChange,
  photo,
  galleryId,
  onPhotoDeleted
}: DeletePhotoDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  const handleDelete = async () => {
    if (!photo || !galleryId) return;
    
    setIsDeleting(true);
    try {
      console.log(`Eliminazione foto: ${photo.name} (ID: ${photo.id})`);
      
      // 1. Elimina il documento da Firestore nella sottocollezione galleries/{galleryId}/photos
      const photoRef = doc(db, "galleries", galleryId, "photos", photo.id);
      await deleteDoc(photoRef);
      console.log(`✓ Eliminato documento da galleries/${galleryId}/photos/${photo.id}`);
      
      // 2. Trova e elimina il documento corrispondente in gallery-photos
      const galleryPhotosQuery = query(
        collection(db, "gallery-photos"),
        where("galleryId", "==", galleryId),
        where("name", "==", photo.name)
      );
      
      const querySnapshot = await getDocs(galleryPhotosQuery);
      if (!querySnapshot.empty) {
        // Elimina tutti i documenti trovati (dovrebbe essere solo uno)
        for (const docSnapshot of querySnapshot.docs) {
          await deleteDoc(docSnapshot.ref);
          console.log(`✓ Eliminato documento da gallery-photos: ${docSnapshot.id}`);
        }
      } else {
        console.warn(`⚠️ Nessun documento trovato in gallery-photos per ${photo.name}`);
      }
      
      // 3. Elimina il file da Firebase Storage
      try {
        // Percorso principale
        const storageRef = ref(storage, `gallery-photos/${galleryId}/${photo.name}`);
        await deleteObject(storageRef);
        console.log(`✓ Eliminato file da Storage: gallery-photos/${galleryId}/${photo.name}`);
      } catch (storageError) {
        console.warn(`⚠️ Errore nell'eliminazione del file da Storage:`, storageError);
        // Proviamo con un percorso alternativo
        try {
          const altStorageRef = ref(storage, `galleries/${galleryId}/photos/${photo.name}`);
          await deleteObject(altStorageRef);
          console.log(`✓ Eliminato file dal percorso alternativo: galleries/${galleryId}/photos/${photo.name}`);
        } catch (altStorageError) {
          console.error(`❌ Impossibile eliminare il file dallo Storage:`, altStorageError);
        }
      }
      
      toast({
        title: "Foto eliminata",
        description: "La foto è stata eliminata con successo dalla galleria."
      });
      
      // Notifica il componente padre che la foto è stata eliminata
      onPhotoDeleted(photo.id);
      
    } catch (error) {
      console.error("Errore durante l'eliminazione della foto:", error);
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione della foto.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
      onOpenChange(false); // Chiudi il dialog
    }
  };

  if (!photo) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
          <AlertDialogDescription>
            Sei sicuro di voler eliminare questa foto?
            <div className="mt-2">
              <p className="font-medium">{photo.name}</p>
              <div className="mt-2 max-h-40 overflow-hidden rounded-md">
                <img 
                  src={photo.url} 
                  alt={photo.name}
                  className="w-full object-cover" 
                />
              </div>
            </div>
            <p className="mt-2 text-red-500">Questa azione è irreversibile.</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Annulla</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-red-500 hover:bg-red-600 text-white"
          >
            {isDeleting ? "Eliminazione..." : "Elimina"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
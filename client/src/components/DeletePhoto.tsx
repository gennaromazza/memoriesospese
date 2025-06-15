
import { useState } from "react";
import { deleteDoc, doc, collection, query, where, getDocs } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import { PhotoData } from "@/hooks/use-gallery-data";
import { useToast } from "@/hooks/use-toast";

interface DeletePhotoProps {
  galleryId: string;
  photo: PhotoData;
  onPhotoDeleted: (photoId: string) => void;
}

export default function DeletePhoto({ galleryId, photo, onPhotoDeleted }: DeletePhotoProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();
  
  const handleDeleteClick = async () => {
    if (!confirm(`Sei sicuro di voler eliminare questa foto (${photo.name})? Questa azione è irreversibile.`)) {
      return;
    }
    
    setIsDeleting(true);
    try {
      
      
      // 1. Elimina il documento da Firestore dalla collezione gallery-photos
      const galleryPhotosQuery = query(
        collection(db, "gallery-photos"),
        where("galleryId", "==", galleryId),
        where("name", "==", photo.name)
      );
      
      const querySnapshot = await getDocs(galleryPhotosQuery);
      if (!querySnapshot.empty) {
        for (const docSnapshot of querySnapshot.docs) {
          await deleteDoc(docSnapshot.ref);
          
        }
      }
      
      // 2. Elimina il file da Firebase Storage con gestione percorsi multipli
      const storagePaths = [
        `gallery-photos/${galleryId}/${photo.name}`,
        `galleries/${galleryId}/photos/${photo.name}`,
        `galleries/${galleryId}/${photo.name}`,
        `galleries/${photo.name}`,
        `gallery-photos/${photo.name}`
      ];
      
      let photoDeleted = false;
      
      for (const path of storagePaths) {
        try {
          const storageRef = ref(storage, path);
          await deleteObject(storageRef);
          
          photoDeleted = true;
          break;
        } catch (storageError) {
          
        }
      }
      
      if (!photoDeleted) {
        
      }
      
      // 3. Aggiorna l'UI chiamando la callback
      onPhotoDeleted(photo.id);
      
      toast({
        title: "Foto eliminata",
        description: "La foto è stata eliminata con successo dalla galleria."
      });
      
    } catch (error) {
      
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante l'eliminazione della foto.",
        variant: "destructive"
      });
    } finally {
      setIsDeleting(false);
    }
  };
  
  return (
    <div 
      className="absolute top-2 left-2 z-10 bg-red-500 text-white rounded-full h-6 w-6 flex items-center justify-center cursor-pointer hover:bg-red-600"
      onClick={(e) => {
        e.stopPropagation();
        if (!isDeleting) {
          handleDeleteClick();
        }
      }}
      title="Elimina foto"
    >
      {isDeleting ? (
        <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      )}
    </div>
  );
}

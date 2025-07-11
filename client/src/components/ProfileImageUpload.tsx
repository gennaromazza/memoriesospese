/**
 * Componente per upload immagine profilo utente con design accattivante
 */

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Upload, X, Sparkles, Image as ImageIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ProfileImageService } from '../lib/profileImageService';
import { auth, storage, db } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

interface ProfileImageUploadProps {
  userId?: string;
  currentImageUrl?: string;
  displayName?: string;
  onImageUpdated?: (newImageUrl: string) => void;
  onUploadComplete?: () => void;
  compact?: boolean;
}

export default function ProfileImageUpload({
  userId,
  currentImageUrl,
  displayName,
  onImageUpdated,
  onUploadComplete,
  compact = false
}: ProfileImageUploadProps) {
  const { user, userProfile, refreshUserProfile } = useFirebaseAuth();
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Use Firebase Auth data when available
  const finalUserId = userId || user?.uid;
  const finalDisplayName = displayName || userProfile?.displayName || user?.displayName || '';
  const finalCurrentImageUrl = currentImageUrl || userProfile?.profileImageUrl;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validazione tipo file
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Formato non valido",
        description: "Seleziona solo file immagine (JPG, PNG, etc.)",
        variant: "destructive"
      });
      return;
    }

    // Validazione dimensione (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File troppo grande",
        description: "L'immagine deve essere inferiore a 5MB",
        variant: "destructive"
      });
      return;
    }

    // Crea anteprima
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload immagine
    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    if (!finalUserId) {
      toast({
        title: "Errore autenticazione",
        description: "Devi essere autenticato per caricare un'immagine profilo",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      const imageUrl = await ProfileImageService.uploadProfileImage(finalUserId, file);

      // Update local callback if provided
      if (onImageUpdated) {
        onImageUpdated(imageUrl);
      }
      
      // Refresh Firebase Auth context
      await refreshUserProfile();
      
      setPreviewUrl(null);

      toast({
        title: "Immagine profilo aggiornata",
        description: "La tua immagine profilo è stata caricata con successo"
      });

      // Call completion callback if provided
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (error) {
      console.error('Errore upload immagine profilo:', error);
      toast({
        title: "Errore caricamento",
        description: "Si è verificato un errore durante il caricamento dell'immagine",
        variant: "destructive"
      });
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!currentImageUrl) return;

    setIsUploading(true);

    try {
      await ProfileImageService.deleteProfileImage(userId, currentImageUrl);
      onImageUpdated('');

      toast({
        title: "Immagine rimossa",
        description: "L'immagine profilo è stata rimossa"
      });
    } catch (error) {
      console.error('Errore rimozione immagine:', error);
      toast({
        title: "Errore rimozione",
        description: "Si è verificato un errore durante la rimozione dell'immagine",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const displayImageUrl = previewUrl || ProfileImageService.getProfileImageUrl(currentImageUrl, displayName);

  return (
    <div className="w-full">
      {/* Header con gradiente e decorazione più prominente */}
      <div className="bg-gradient-to-r from-sage/20 to-blue-gray/20 border-2 border-sage/40 rounded-3xl p-8 mb-8 shadow-2xl">
        <div className="flex flex-col items-center space-y-8">
          {/* Avatar container con effetti più evidenti */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-sage to-blue-gray rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-300 blur-sm"></div>
            <div className="absolute -inset-1 bg-gradient-to-r from-sage to-blue-gray rounded-full opacity-30 group-hover:opacity-60 transition-opacity duration-300"></div>
            <div className="relative">
              <Avatar className="w-40 h-40 border-6 border-white shadow-2xl ring-4 ring-sage/30">
                <AvatarImage src={displayImageUrl} alt={displayName} className="object-cover" />
                <AvatarFallback className="bg-gradient-to-br from-sage-600 to-blue-gray-600 text-white text-3xl font-bold">
                  {displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                </AvatarFallback>
              </Avatar>

              {/* Overlay di caricamento */}
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center">
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-8 h-8 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-white text-xs font-medium">Caricamento...</span>
                  </div>
                </div>
              )}

              {/* Indicatore hover */}
              <div className="absolute inset-0 bg-black/0 hover:bg-black/20 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 cursor-pointer"
                   onClick={() => fileInputRef.current?.click()}>
                <div className="bg-white/90 backdrop-blur-sm rounded-full p-3">
                  <Camera className="w-6 h-6 text-sage" />
                </div>
              </div>
            </div>
          </div>

          {/* Titolo con decorazione più prominente */}
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Sparkles className="w-7 h-7 text-sage animate-pulse" />
              <h3 className="text-2xl font-bold text-blue-gray-800 bg-gradient-to-r from-sage-600 to-blue-gray-600 bg-clip-text text-transparent">
                {currentImageUrl ? 'Personalizza la tua immagine' : 'Aggiungi una foto profilo'}
              </h3>
              <Sparkles className="w-7 h-7 text-sage animate-pulse" />
            </div>
            <p className="text-base text-gray-700 max-w-md font-medium">
              {currentImageUrl 
                ? 'La tua foto apparirà nei commenti e messaggi vocali' 
                : 'Carica una foto per personalizzare i tuoi commenti e messaggi vocali'}
            </p>
            <div className="w-24 h-1 bg-gradient-to-r from-sage to-blue-gray rounded-full mx-auto"></div>
          </div>

          {/* Pulsanti stilizzati più prominenti */}
          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-lg">
            <Button
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 bg-gradient-to-r from-sage-600 via-blue-gray-600 to-sage-700 hover:from-sage-700 hover:via-blue-gray-700 hover:to-sage-800 text-white border-0 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-110 hover:-translate-y-1 ring-2 ring-sage-300 hover:ring-sage-400"
            >
              <div className="flex items-center gap-3">
                <ImageIcon className="w-5 h-5" />
                <span className="font-bold text-lg">
                  {currentImageUrl ? 'Cambia foto' : 'Scegli foto'}
                </span>
                <Camera className="w-5 h-5" />
              </div>
            </Button>

            {currentImageUrl && (
              <Button
                variant="outline"
                size="default"
                onClick={handleRemoveImage}
                disabled={isUploading}
                className="flex-1 bg-white/60 backdrop-blur-sm hover:bg-red-50 hover:text-red-600 border-red-200 hover:border-red-300 transition-all duration-300"
              >
                <div className="flex items-center gap-2">
                  <X className="w-4 h-4" />
                  <span className="font-medium">Rimuovi</span>
                </div>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Statistiche e suggerimenti */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-sage/10 p-2 rounded-full">
              <Camera className="w-5 h-5 text-sage" />
            </div>
            <div>
              <div className="text-sm font-medium text-blue-gray">Formato consigliato</div>
              <div className="text-xs text-gray-600">JPG, PNG - Max 5MB</div>
            </div>
          </div>
        </div>

        <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="bg-sage/10 p-2 rounded-full">
              <Sparkles className="w-5 h-5 text-sage" />
            </div>
            <div>
              <div className="text-sm font-medium text-blue-gray">Compressione automatica</div>
              <div className="text-xs text-gray-600">Ottimizzata per il web</div>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
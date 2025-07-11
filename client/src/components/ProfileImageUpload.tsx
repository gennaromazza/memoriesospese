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

interface ProfileImageUploadProps {
  userId: string;
  currentImageUrl?: string;
  displayName: string;
  onImageUpdated: (newImageUrl: string) => void;
}

export default function ProfileImageUpload({
  userId,
  currentImageUrl,
  displayName,
  onImageUpdated
}: ProfileImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setIsUploading(true);

    try {
      const imageUrl = await ProfileImageService.uploadProfileImage(userId, file);

      onImageUpdated(imageUrl);
      setPreviewUrl(null);

      toast({
        title: "Immagine profilo aggiornata",
        description: "La tua immagine profilo è stata caricata con successo"
      });
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
      {/* Header con gradiente e decorazione */}
      <div className="bg-gradient-to-r from-sage/10 to-blue-gray/10 border border-sage/20 rounded-2xl p-6 mb-6">
        <div className="flex flex-col items-center space-y-6">
          {/* Avatar container con effetti */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-sage to-blue-gray rounded-full opacity-20 group-hover:opacity-40 transition-opacity duration-300"></div>
            <div className="relative">
              <Avatar className="w-32 h-32 border-4 border-white shadow-xl">
                <AvatarImage src={displayImageUrl} alt={displayName} className="object-cover" />
                <AvatarFallback className="bg-sage text-white text-2xl font-bold">
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

          {/* Titolo con decorazione */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="w-5 h-5 text-sage animate-pulse" />
              <h3 className="text-lg font-semibold text-blue-gray">
                {currentImageUrl ? 'Personalizza la tua immagine' : 'Aggiungi una foto profilo'}
              </h3>
              <Sparkles className="w-5 h-5 text-sage animate-pulse" />
            </div>
            <p className="text-sm text-gray-600 max-w-sm">
              {currentImageUrl 
                ? 'La tua foto apparirà nei commenti e messaggi vocali' 
                : 'Carica una foto per personalizzare i tuoi commenti e messaggi vocali'}
            </p>
          </div>

          {/* Pulsanti stilizzati */}
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
            <Button
              variant="outline"
              size="default"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex-1 bg-white/60 backdrop-blur-sm hover:bg-sage hover:text-white border-sage/30 hover:border-sage transition-all duration-300 transform hover:scale-105"
            >
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                <span className="font-medium">
                  {currentImageUrl ? 'Cambia foto' : 'Scegli foto'}
                </span>
                <Camera className="w-4 h-4" />
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
import React, { useState, useCallback } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

interface WatermarkUploadProps {
  currentWatermarkUrl?: string;
  onWatermarkChange?: (url: string | null) => void;
}

export function WatermarkUpload({ currentWatermarkUrl, onWatermarkChange }: WatermarkUploadProps) {
  const { user } = useFirebaseAuth();
  const [uploading, setUploading] = useState(false);
  const [watermarkUrl, setWatermarkUrl] = useState(currentWatermarkUrl);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {

    if (!user) {
      toast.error('Devi essere autenticato per caricare un watermark');
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      toast.error('Il file deve essere un\'immagine');
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB limit
      toast.error('Il file non deve superare i 2MB');
      return;
    }

    setUploading(true);
    try {
      // Upload to Firebase Storage
      const watermarkRef = ref(storage, `watermarks/${user.uid}.png`);
      await uploadBytes(watermarkRef, file);
      const url = await getDownloadURL(watermarkRef);

      // Update user profile with watermark URL
      await updateDoc(doc(db, 'users', user.uid), {
        watermarkUrl: url,
        updatedAt: new Date(),
      });

      setWatermarkUrl(url);
      onWatermarkChange?.(url);
      toast.success('Watermark caricato con successo');
    } catch (error) {
      console.error('Errore caricamento watermark:', error);
      toast.error('Errore durante il caricamento del watermark');
    } finally {
      setUploading(false);
    }
  }, [user, onWatermarkChange]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  const handleRemoveWatermark = async () => {
    if (!user || !watermarkUrl) return;

    try {
      // Delete from storage
      const watermarkRef = ref(storage, `watermarks/${user.uid}.png`);
      await deleteObject(watermarkRef);

      // Update user profile
      await updateDoc(doc(db, 'users', user.uid), {
        watermarkUrl: null,
        updatedAt: new Date(),
      });

      setWatermarkUrl(undefined);
      onWatermarkChange?.(null);
      toast.success('Watermark rimosso');
    } catch (error) {
      console.error('Errore rimozione watermark:', error);
      toast.error('Errore durante la rimozione del watermark');
    }
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>Watermark Personalizzato</CardTitle>
        <CardDescription>
          Carica un'immagine PNG con sfondo trasparente per migliori risultati
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {watermarkUrl ? (
          <div className="space-y-4">
            <div className="relative inline-block">
              <img
                src={watermarkUrl}
                alt="Watermark"
                className="max-h-32 bg-gray-100 rounded p-2"
              />
              <Button
                size="icon"
                variant="destructive"
                className="absolute -top-2 -right-2"
                onClick={handleRemoveWatermark}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Il watermark verrà applicato a tutte le anteprime delle foto
            </p>
          </div>
        ) : (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}
              ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <input {...getInputProps()} />
            <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p className="text-sm text-gray-600">
              {isDragActive
                ? 'Rilascia il file qui...'
                : 'Trascina un\'immagine qui o clicca per selezionare'}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              PNG consigliato, max 2MB
            </p>
            {uploading && (
              <p className="text-sm text-primary mt-2">Caricamento in corso...</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
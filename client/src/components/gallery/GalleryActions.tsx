import React from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';

interface GalleryActionsProps {
  galleryId: string;
  galleryName: string;
  isOwner: boolean;
}

export function GalleryActions({ galleryId, galleryName, isOwner }: GalleryActionsProps) {
  const { user } = useFirebaseAuth();

  if (!isOwner || !user) {
    return null;
  }

  return (
    <>
      <Card className="mt-4">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info className="h-5 w-5" />
            Azioni Galleria
          </h3>
          
          <p className="text-sm text-muted-foreground">
            Le azioni di export e download sono temporaneamente non disponibili.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
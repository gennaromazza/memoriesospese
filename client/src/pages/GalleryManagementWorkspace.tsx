/**
 * Gallery Management Workspace - Admin tool per gestione galleria
 * Features: Photo upload, Client selection view, Settings
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRoute, useLocation } from 'wouter';
import { GalleryService, type Gallery } from '@/lib/galleries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Upload, Users, Settings } from 'lucide-react';

export default function GalleryManagementWorkspace() {
  const [, params] = useRoute('/admin/gallery/:galleryId/manage');
  const [, setLocation] = useLocation();
  const galleryId = params?.galleryId;

  // Query gallery data
  const { data: gallery, isLoading } = useQuery<Gallery | null>({
    queryKey: ['gallery', galleryId],
    queryFn: () => (galleryId ? GalleryService.getGalleryById(galleryId) : null),
    enabled: !!galleryId,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-cream via-soft-peach to-light-sage flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sage border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Caricamento galleria...</p>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-warm-cream via-soft-peach to-light-sage flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-12">
            <p className="text-lg font-medium text-gray-700 mb-4">Galleria non trovata</p>
            <Button onClick={() => setLocation('/admin/dashboard')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-warm-cream via-soft-peach to-light-sage py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setLocation('/admin/dashboard')}
            className="mb-4"
            data-testid="button-back-dashboard"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Torna a BookingsManager
          </Button>

          <Card>
            <CardHeader>
              <CardTitle className="font-playfair text-3xl text-blue-gray">
                Gestisci Galleria: {gallery.name}
              </CardTitle>
              <CardDescription>
                Codice: <strong>{gallery.code}</strong> | Foto: <strong>{gallery.photoCount || 0}</strong>
                {gallery.selectionEnabled && (
                  <> | Modalità Selezione: <strong className="text-sage">{gallery.requiredPhotoCount} foto richieste</strong></>
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" data-testid="tab-upload">
              <Upload className="w-4 h-4 mr-2" />
              Carica Foto
            </TabsTrigger>
            <TabsTrigger value="selections" data-testid="tab-selections" disabled={!gallery.selectionEnabled}>
              <Users className="w-4 h-4 mr-2" />
              Selezioni Cliente
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings">
              <Settings className="w-4 h-4 mr-2" />
              Impostazioni
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Upload Foto */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>Carica Foto Bulk</CardTitle>
                <CardDescription>
                  Carica le foto dello shooting. Watermark e compressione automatici.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">Upload Bulk Foto</p>
                  <p className="text-sm">Feature in implementazione - Task 10</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Selezioni Cliente */}
          <TabsContent value="selections">
            <Card>
              <CardHeader>
                <CardTitle>Selezioni Cliente</CardTitle>
                <CardDescription>
                  Visualizza le foto selezionate dal cliente e esporta i nomi per Lightroom.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-gray-500">
                  <Users className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium mb-2">Selezioni Cliente</p>
                  <p className="text-sm">Feature in implementazione - Task 11</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Impostazioni */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Impostazioni Galleria</CardTitle>
                <CardDescription>
                  Modifica deadline, sblocca selezione, e altre configurazioni.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h4 className="font-semibold text-blue-gray mb-2">Stato Galleria</h4>
                    <p className="text-sm text-gray-600">
                      <strong>Foto caricate:</strong> {gallery.photoCount || 0}
                    </p>
                    {gallery.selectionEnabled && (
                      <>
                        <p className="text-sm text-gray-600">
                          <strong>Stato selezione:</strong> {gallery.selectionStatus === 'completed' ? '✅ Completata' : '⏳ In attesa'}
                        </p>
                        <p className="text-sm text-gray-600">
                          <strong>Foto richieste:</strong> {gallery.requiredPhotoCount}
                        </p>
                        {gallery.selectionDeadline && (
                          <p className="text-sm text-gray-600">
                            <strong>Scadenza:</strong> {new Date(gallery.selectionDeadline).toLocaleDateString('it-IT')}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <div className="text-center py-8 text-gray-500">
                    <Settings className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">Impostazioni avanzate in implementazione - Task 20</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

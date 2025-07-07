import { useState } from 'react';
import { useParams } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Heart, MessageCircle, Upload, ArrowLeft } from 'lucide-react';

export default function Gallery() {
  const { code } = useParams<{ code: string }>();
  const [likedPhotos, setLikedPhotos] = useState<Set<string>>(new Set());

  // Dati mock per le foto
  const photos = [
    { id: '1', url: '/api/placeholder/400/300', title: 'Cerimonia', likes: 15, comments: 3 },
    { id: '2', url: '/api/placeholder/400/300', title: 'Ricevimento', likes: 23, comments: 7 },
    { id: '3', url: '/api/placeholder/400/300', title: 'Primo Ballo', likes: 45, comments: 12 },
    { id: '4', url: '/api/placeholder/400/300', title: 'Famiglia', likes: 18, comments: 5 },
    { id: '5', url: '/api/placeholder/400/300', title: 'Torta', likes: 32, comments: 8 },
    { id: '6', url: '/api/placeholder/400/300', title: 'Bouquet', likes: 27, comments: 4 },
  ];

  const handleLike = (photoId: string) => {
    setLikedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              Galleria: {code}
            </h1>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              Matrimonio di Marco e Giulia - 15 Giugno 2024
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.href = '/'}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Carica Foto
            </Button>
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {photos.map((photo) => (
            <Card key={photo.id} className="overflow-hidden group">
              <div className="relative aspect-square">
                <img
                  src={photo.url}
                  alt={photo.title}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={likedPhotos.has(photo.id) ? "default" : "secondary"}
                      onClick={() => handleLike(photo.id)}
                    >
                      <Heart className={`h-4 w-4 ${likedPhotos.has(photo.id) ? 'fill-current' : ''}`} />
                    </Button>
                    <Button size="sm" variant="secondary">
                      <MessageCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <CardContent className="p-4">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  {photo.title}
                </h3>
                <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-1">
                    <Heart className="h-4 w-4" />
                    <span>{photo.likes + (likedPhotos.has(photo.id) ? 1 : 0)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" />
                    <span>{photo.comments}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {photos.length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Foto Totali
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {photos.reduce((sum, photo) => sum + photo.likes, 0)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Like Totali
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                {photos.reduce((sum, photo) => sum + photo.comments, 0)}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                Commenti Totali
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
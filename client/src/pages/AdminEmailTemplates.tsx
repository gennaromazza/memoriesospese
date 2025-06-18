import { useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import EmailTemplateManager from '@/components/admin/EmailTemplateManager';

export default function AdminEmailTemplates() {
  const { id } = useParams();
  const [, navigate] = useLocation();

  // Fetch gallery data
  const { data: gallery, isLoading } = useQuery({
    queryKey: [`/api/galleries/${id}`],
    queryFn: () => fetch(`/api/galleries/${id}`).then(res => res.json()),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sage-600"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!gallery) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <Card>
            <CardContent className="p-6 text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Galleria non trovata</h2>
              <p className="text-gray-600 mb-4">La galleria richiesta non esiste o non è accessibile.</p>
              <Button onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Torna alla Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(`/gallery/${id}`)}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Torna alla Galleria
          </Button>
          <div className="border-l border-gray-300 h-6"></div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestione Template Email</h1>
            <p className="text-gray-600">Galleria: {gallery.name}</p>
          </div>
        </div>

        {/* Email Template Manager */}
        <EmailTemplateManager 
          galleryId={gallery.id}
          galleryName={gallery.name}
        />
      </div>
    </div>
  );
}
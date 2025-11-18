
import { useState, useEffect } from 'react';
import WeddingVideoService from '@/lib/weddingVideos';
import type { WeddingVideo } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, Star, Loader2, Eye, ArrowUpDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function WeddingVideosManager() {
  const [videos, setVideos] = useState<WeddingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVideo, setEditingVideo] = useState<WeddingVideo | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    description: '',
    thumbnailUrl: '',
    youtubeUrl: '',
    duration: '',
    category: '',
    tags: '',
    featured: false,
    sortOrder: 0
  });

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const allVideos = await WeddingVideoService.getAllVideos();
      setVideos(allVideos);
    } catch (error) {
      console.error('Errore caricamento video:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile caricare i video',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (video?: WeddingVideo) => {
    if (video) {
      setEditingVideo(video);
      setFormData({
        title: video.title,
        slug: video.slug,
        description: video.description || '',
        thumbnailUrl: video.thumbnailUrl,
        youtubeUrl: video.youtubeUrl,
        duration: video.duration || '',
        category: video.category || '',
        tags: video.tags?.join(', ') || '',
        featured: video.featured,
        sortOrder: video.sortOrder
      });
    } else {
      setEditingVideo(null);
      setFormData({
        title: '',
        slug: '',
        description: '',
        thumbnailUrl: '',
        youtubeUrl: '',
        duration: '',
        category: '',
        tags: '',
        featured: false,
        sortOrder: videos.length
      });
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.title || !formData.slug || !formData.thumbnailUrl || !formData.youtubeUrl) {
      toast({
        title: 'Campi obbligatori',
        description: 'Titolo, slug, copertina e link YouTube sono obbligatori',
        variant: 'destructive'
      });
      return;
    }

    setSaving(true);
    try {
      const videoData = {
        ...formData,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()) : []
      };

      if (editingVideo) {
        await WeddingVideoService.updateVideo(editingVideo.id, videoData);
        toast({
          title: 'Video aggiornato',
          description: 'Le modifiche sono state salvate con successo'
        });
      } else {
        await WeddingVideoService.createVideo(videoData);
        toast({
          title: 'Video creato',
          description: 'Il nuovo video è stato aggiunto con successo'
        });
      }

      setIsDialogOpen(false);
      loadVideos();
    } catch (error) {
      console.error('Errore salvataggio video:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile salvare il video',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo video?')) return;

    try {
      await WeddingVideoService.deleteVideo(id);
      toast({
        title: 'Video eliminato',
        description: 'Il video è stato rimosso con successo'
      });
      loadVideos();
    } catch (error) {
      console.error('Errore eliminazione video:', error);
      toast({
        title: 'Errore',
        description: 'Impossibile eliminare il video',
        variant: 'destructive'
      });
    }
  };

  // Auto-generate slug from title
  const handleTitleChange = (title: string) => {
    setFormData(prev => ({
      ...prev,
      title,
      slug: !editingVideo ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : prev.slug
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Video Matrimoni</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gestisci i video per la galleria pubblica - {videos.length} video totali
          </p>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Video
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingVideo ? 'Modifica Video' : 'Nuovo Video'}</DialogTitle>
              <DialogDescription>
                Inserisci i dettagli del video matrimonio
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titolo *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Es. Matrimonio Maria & Luca"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug URL *</Label>
                <Input
                  id="slug"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  placeholder="es. matrimonio-maria-luca"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Descrizione</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Breve descrizione del video..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="thumbnailUrl">URL Immagine Copertina *</Label>
                <Input
                  id="thumbnailUrl"
                  value={formData.thumbnailUrl}
                  onChange={(e) => setFormData({ ...formData, thumbnailUrl: e.target.value })}
                  placeholder="https://..."
                />
                {formData.thumbnailUrl && (
                  <img src={formData.thumbnailUrl} alt="Preview" className="w-full h-40 object-cover rounded-lg mt-2" />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="youtubeUrl">Link YouTube *</Label>
                <Input
                  id="youtubeUrl"
                  value={formData.youtubeUrl}
                  onChange={(e) => setFormData({ ...formData, youtubeUrl: e.target.value })}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Durata (es. 5:30)</Label>
                  <Input
                    id="duration"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                    placeholder="5:30"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Input
                    id="category"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="Matrimoni"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tags">Tags (separati da virgola)</Label>
                <Input
                  id="tags"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="matrimonio, cerimonia, festa"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="featured">In Evidenza</Label>
                <Switch
                  id="featured"
                  checked={formData.featured}
                  onCheckedChange={(checked) => setFormData({ ...formData, featured: checked })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sortOrder">Ordinamento</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'Salvataggio...' : 'Salva'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {videos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Nessun video presente. Clicca "Nuovo Video" per iniziare.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map(video => (
            <Card key={video.id}>
              <CardHeader className="p-0">
                <div className="relative aspect-video">
                  <img
                    src={video.thumbnailUrl}
                    alt={video.title}
                    className="w-full h-full object-cover rounded-t-lg"
                  />
                  {video.featured && (
                    <Badge className="absolute top-2 left-2 bg-yellow-500">
                      <Star className="h-3 w-3 mr-1" />
                      In Evidenza
                    </Badge>
                  )}
                  {video.duration && (
                    <Badge className="absolute bottom-2 right-2 bg-black/80">
                      {video.duration}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-2 line-clamp-2">{video.title}</h3>
                {video.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                    {video.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mb-3">
                  {video.category && (
                    <Badge variant="outline">{video.category}</Badge>
                  )}
                  {video.views && video.views > 0 && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {video.views}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleOpenDialog(video)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Modifica
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(video.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

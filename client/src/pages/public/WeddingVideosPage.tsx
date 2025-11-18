
import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Play, Loader2, Eye } from 'lucide-react';
import WeddingVideoService from '@/lib/weddingVideos';
import type { WeddingVideo } from '@shared/schema';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Helper per estrarre ID YouTube
function getYouTubeVideoId(url: string): string {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : '';
}

export default function WeddingVideosPage() {
  const [videos, setVideos] = useState<WeddingVideo[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<WeddingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<WeddingVideo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadVideos();
  }, []);

  const loadVideos = async () => {
    setLoading(true);
    try {
      const [allVideos, featured] = await Promise.all([
        WeddingVideoService.getAllVideos(),
        WeddingVideoService.getFeaturedVideos()
      ]);
      
      setVideos(allVideos);
      setFeaturedVideos(featured);
    } catch (error) {
      console.error('Errore caricamento video:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePlayVideo = (video: WeddingVideo) => {
    WeddingVideoService.incrementViews(video.id);
    setSelectedVideo(video);
  };

  const categories = Array.from(new Set(videos.map(v => v.category).filter(Boolean)));
  const filteredVideos = selectedCategory === 'all' 
    ? videos 
    : videos.filter(v => v.category === selectedCategory);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-black text-white">
      {/* Header */}
      <nav className="sticky top-0 bg-black/80 backdrop-blur-md z-50 border-b border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-playfair text-white">
              iMaGe <span className="text-terracotta">Studio</span>
            </Link>
            <Link href="/">
              <Button variant="ghost" className="text-gray-300 hover:text-white">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 pt-8 pb-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-playfair mb-4">
            Video Matrimoni
          </h1>
          <p className="text-xl text-gray-300">
            Le emozioni dei nostri sposi raccontate attraverso l'arte del video
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-24">
            <Loader2 className="h-12 w-12 animate-spin text-terracotta" />
          </div>
        ) : (
          <>
            {/* Featured Videos - Hero Carousel */}
            {featuredVideos.length > 0 && (
              <div className="mb-12">
                <h2 className="text-2xl font-semibold mb-6">In Evidenza</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {featuredVideos.slice(0, 2).map(video => (
                    <div
                      key={video.id}
                      className="group relative cursor-pointer rounded-lg overflow-hidden aspect-video"
                      onClick={() => handlePlayVideo(video)}
                    >
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="absolute bottom-0 left-0 right-0 p-6">
                          <h3 className="text-2xl font-semibold mb-2">{video.title}</h3>
                          {video.description && (
                            <p className="text-gray-300 text-sm mb-3">{video.description}</p>
                          )}
                          <div className="flex items-center gap-4">
                            <Button className="bg-white text-black hover:bg-gray-200">
                              <Play className="mr-2 h-5 w-5" />
                              Riproduci
                            </Button>
                            {video.duration && (
                              <span className="text-sm text-gray-300">{video.duration}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="absolute top-4 left-4">
                        <Badge className="bg-terracotta text-white">In Evidenza</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Filters */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                <Badge
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  className="cursor-pointer px-4 py-2"
                  onClick={() => setSelectedCategory('all')}
                >
                  Tutti ({videos.length})
                </Badge>
                {categories.map(cat => {
                  const count = videos.filter(v => v.category === cat).length;
                  return (
                    <Badge
                      key={cat}
                      variant={selectedCategory === cat ? 'default' : 'outline'}
                      className="cursor-pointer px-4 py-2"
                      onClick={() => setSelectedCategory(cat!)}
                    >
                      {cat} ({count})
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Video Grid */}
            {filteredVideos.length === 0 ? (
              <div className="text-center py-24">
                <p className="text-xl text-gray-400">
                  Nessun video disponibile al momento.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filteredVideos.map(video => (
                  <div
                    key={video.id}
                    className="group cursor-pointer"
                    onClick={() => handlePlayVideo(video)}
                  >
                    <div className="relative rounded-lg overflow-hidden aspect-video mb-3">
                      <img
                        src={video.thumbnailUrl}
                        alt={video.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                        <Play className="h-12 w-12" />
                      </div>
                      {video.duration && (
                        <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs">
                          {video.duration}
                        </div>
                      )}
                    </div>
                    <h3 className="font-semibold text-sm mb-1 line-clamp-2">{video.title}</h3>
                    {video.views && video.views > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Eye className="h-3 w-3" />
                        {video.views} visualizzazioni
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Video Player Modal */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-5xl max-h-[90vh] p-0 bg-black border-gray-800">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-white text-2xl">{selectedVideo?.title}</DialogTitle>
          </DialogHeader>
          <div className="relative w-full aspect-video">
            {selectedVideo && (
              <iframe
                src={`https://www.youtube.com/embed/${getYouTubeVideoId(selectedVideo.youtubeUrl)}?autoplay=1`}
                title={selectedVideo.title}
                className="w-full h-full"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            )}
          </div>
          {selectedVideo?.description && (
            <div className="px-6 pb-6">
              <p className="text-gray-300">{selectedVideo.description}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

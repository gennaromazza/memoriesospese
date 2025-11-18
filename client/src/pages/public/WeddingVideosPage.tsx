
import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Play, Loader2, Eye, Sparkles, TrendingUp, Heart, Share2 } from 'lucide-react';
import WeddingVideoService from '@/lib/weddingVideos';
import { getActiveJobTypes } from '@/lib/job-types';
import type { WeddingVideo } from '@shared/schema';
import type { JobType } from '@shared/job-types';
import { useToast } from '@/hooks/use-toast';
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

// Helper per generare likes casuali (400-1200)
function getRandomLikes(videoId: string): number {
  // Usa l'ID del video come seed per generare un numero consistente
  const seed = videoId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 400 + (seed % 800);
}

// Helper per generare visualizzazioni casuali (8k-25k + views reali)
function getRandomBaseViews(videoId: string): number {
  const seed = videoId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 8000 + (seed % 17000);
}

// VideoCard component
function VideoCard({ video, onClick, onLike, onShare, isLiked, likeCount }: { 
  video: WeddingVideo; 
  onClick: () => void;
  onLike: (e: React.MouseEvent) => void;
  onShare: (e: React.MouseEvent) => void;
  isLiked: boolean;
  likeCount: number;
}) {
  // Visualizzazioni: base casuale + conteggio reale
  const displayViews = getRandomBaseViews(video.id) + (video.views || 0);
  
  return (
    <div className="group cursor-pointer" onClick={onClick}>
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Eye className="h-3 w-3" />
          {displayViews.toLocaleString('it-IT')} visualizzazioni
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onLike}
            className={`flex items-center gap-1 hover:scale-110 transition-transform ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
          >
            <Heart className={`h-4 w-4 ${isLiked ? 'fill-current' : ''}`} />
            <span className="text-xs font-medium">{likeCount.toLocaleString('it-IT')}</span>
          </button>
          <button
            onClick={onShare}
            className="p-1 text-gray-400 hover:text-terracotta hover:scale-110 transition-transform"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WeddingVideosPage() {
  const [videos, setVideos] = useState<WeddingVideo[]>([]);
  const [featuredVideos, setFeaturedVideos] = useState<WeddingVideo[]>([]);
  const [jobTypes, setJobTypes] = useState<JobType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<WeddingVideo | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadVideos();
    loadJobTypes();
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
      
      // Inizializza i contatori like con valori casuali
      const initialCounts: Record<string, number> = {};
      allVideos.forEach(video => {
        initialCounts[video.id] = getRandomLikes(video.id);
      });
      setLikeCounts(initialCounts);
    } catch (error) {
      console.error('Errore caricamento video:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadJobTypes = async () => {
    try {
      const types = await getActiveJobTypes();
      setJobTypes(types);
    } catch (error) {
      console.error('Errore caricamento tipi lavoro:', error);
    }
  };

  const handlePlayVideo = (video: WeddingVideo) => {
    WeddingVideoService.incrementViews(video.id);
    setSelectedVideo(video);
  };

  const handleLike = (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setLikedVideos(prev => {
      const newSet = new Set(prev);
      const wasLiked = newSet.has(videoId);
      
      if (wasLiked) {
        newSet.delete(videoId);
        setLikeCounts(counts => ({
          ...counts,
          [videoId]: (counts[videoId] || 0) - 1
        }));
        toast({
          description: "Rimosso dai preferiti"
        });
      } else {
        newSet.add(videoId);
        setLikeCounts(counts => ({
          ...counts,
          [videoId]: (counts[videoId] || 0) + 1
        }));
        toast({
          description: "❤️ Aggiunto ai preferiti"
        });
      }
      return newSet;
    });
  };

  const handleShare = (video: WeddingVideo, e: React.MouseEvent) => {
    e.stopPropagation();
    const shareUrl = window.location.origin + window.location.pathname;
    
    if (navigator.share) {
      navigator.share({
        title: video.title,
        text: video.description || 'Guarda questo video su iMaGe Vision',
        url: shareUrl
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copiato!",
        description: "Il link è stato copiato negli appunti"
      });
    }
  };

  // Video Nuovi (ultimi 30 giorni)
  const newVideos = videos.filter(v => {
    if (!v.createdAt) return false;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const videoDate = v.createdAt.toDate ? v.createdAt.toDate() : new Date(v.createdAt);
    return videoDate >= thirtyDaysAgo;
  }).slice(0, 8);

  // Video Consigliati (più visualizzati)
  const recommendedVideos = [...videos]
    .filter(v => v.views && v.views > 0)
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 8);

  // Video per JobType
  const videosByJobType = jobTypes.map(jobType => ({
    jobType,
    videos: videos.filter(v => v.category === jobType.nome).slice(0, 8)
  })).filter(item => item.videos.length > 0);

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
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight mb-4" style={{ fontFamily: 'Impact, "Arial Black", sans-serif' }}>
            iMaGe Vision
          </h1>
          <p className="text-xl text-gray-300">
            Ogni evento raccontato con emozione attraverso l'arte del video
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

            {/* Video Nuovi */}
            {newVideos.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                  <Sparkles className="h-6 w-6 text-terracotta" />
                  <h2 className="text-2xl font-semibold">Nuovi</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {newVideos.map(video => (
                    <VideoCard 
                      key={video.id} 
                      video={video} 
                      onClick={() => handlePlayVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Video Consigliati */}
            {recommendedVideos.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-2 mb-6">
                  <TrendingUp className="h-6 w-6 text-terracotta" />
                  <h2 className="text-2xl font-semibold">Consigliati</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {recommendedVideos.map(video => (
                    <VideoCard 
                      key={video.id} 
                      video={video} 
                      onClick={() => handlePlayVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Video per Tipo Lavoro (JobTypes) */}
            {videosByJobType.map(({ jobType, videos: typeVideos }) => (
              <div key={jobType.id} className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  {jobType.icona && <span className="text-2xl">{jobType.icona}</span>}
                  <h2 className="text-2xl font-semibold">{jobType.nome}</h2>
                  <Badge variant="outline">{typeVideos.length}</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {typeVideos.map(video => (
                    <VideoCard 
                      key={video.id} 
                      video={video} 
                      onClick={() => handlePlayVideo(video)}
                      onLike={(e) => handleLike(video.id, e)}
                      onShare={(e) => handleShare(video, e)}
                      isLiked={likedVideos.has(video.id)}
                      likeCount={likeCounts[video.id] || 0}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Fallback se non ci sono video */}
            {videos.length === 0 && (
              <div className="text-center py-24">
                <p className="text-xl text-gray-400">
                  Nessun video disponibile al momento.
                </p>
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

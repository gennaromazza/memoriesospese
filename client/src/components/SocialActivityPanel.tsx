import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  MessageCircle, 
  Heart, 
  TrendingUp,
  User,
  Clock,
  Crown,
  Medal,
  Award,
  ChevronRight
} from 'lucide-react';
import { Comment } from '@shared/schema';

interface PhotoStats {
  id: string;
  name: string;
  url: string;
  likesCount: number;
  commentsCount: number;
}

interface SocialActivityPanelProps {
  galleryId: string;
  className?: string;
}

export default function SocialActivityPanel({ galleryId, className = '' }: SocialActivityPanelProps) {
  const [recentComments, setRecentComments] = useState<Comment[]>([]);
  const [topPhotos, setTopPhotos] = useState<PhotoStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'comments' | 'photos'>('comments');

  const formatDateTime = (timestamp: any): string => {
    try {
      let date: Date;
      
      if (timestamp && timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp && timestamp.seconds && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp) {
        date = new Date(timestamp);
      } else {
        return 'Ora';
      }
      
      if (isNaN(date.getTime())) return 'Ora';
      
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffMins < 1) return 'Ora';
      if (diffMins < 60) return `${diffMins}m fa`;
      if (diffHours < 24) return `${diffHours}h fa`;
      if (diffDays < 7) return `${diffDays}g fa`;
      
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit'
      });
    } catch (error) {
      return 'Ora';
    }
  };

  const fetchRecentComments = async () => {
    try {
      const response = await fetch(`/api/galleries/${galleryId}/comments/recent`);
      if (response.ok) {
        const data = await response.json();
        setRecentComments(data.slice(0, 8)); // Limit to 8 recent comments
      }
    } catch (error) {
      console.error('Error fetching recent comments:', error);
    }
  };

  const fetchTopPhotos = async () => {
    try {
      const response = await fetch(`/api/galleries/${galleryId}/photos/top-liked`);
      if (response.ok) {
        const data = await response.json();
        setTopPhotos(data.slice(0, 5)); // Top 5 photos
      }
    } catch (error) {
      console.error('Error fetching top photos:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchRecentComments(),
        fetchTopPhotos()
      ]);
      setIsLoading(false);
    };

    loadData();
    
    // Refresh data every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [galleryId]);

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0: return <Crown className="h-4 w-4 text-yellow-500" />;
      case 1: return <Medal className="h-4 w-4 text-gray-400" />;
      case 2: return <Award className="h-4 w-4 text-amber-600" />;
      default: return <span className="text-sm font-bold text-gray-500">#{index + 1}</span>;
    }
  };

  if (isLoading) {
    return (
      <Card className={`${className} border-gray-200 bg-white/95 backdrop-blur-sm`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-sage-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${className} border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-sage-600" />
          Attività Social
        </CardTitle>
        <div className="flex gap-1 mt-3">
          <Button
            onClick={() => setActiveTab('comments')}
            variant={activeTab === 'comments' ? 'default' : 'outline'}
            size="sm"
            className={`h-8 px-3 ${
              activeTab === 'comments' 
                ? 'bg-sage-600 hover:bg-sage-700 text-white' 
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <MessageCircle className="h-3 w-3 mr-1" />
            Commenti
          </Button>
          <Button
            onClick={() => setActiveTab('photos')}
            variant={activeTab === 'photos' ? 'default' : 'outline'}
            size="sm"
            className={`h-8 px-3 ${
              activeTab === 'photos' 
                ? 'bg-sage-600 hover:bg-sage-700 text-white' 
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Heart className="h-3 w-3 mr-1" />
            Top Foto
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <ScrollArea className="h-80">
          <div className="p-4">
            {activeTab === 'comments' ? (
              <div className="space-y-3">
                {recentComments.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Nessun commento recente</p>
                  </div>
                ) : (
                  recentComments.map((comment, index) => (
                    <div key={comment.id} className="group">
                      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="w-8 h-8 bg-gradient-to-br from-sage-100 to-blue-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-sage-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {comment.userName}
                            </p>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="h-3 w-3" />
                              {formatDateTime(comment.createdAt)}
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed">
                            {comment.content}
                          </p>
                          <div className="flex items-center justify-between mt-2">
                            <Badge variant="outline" className="text-xs px-2 py-0.5">
                              {comment.itemType === 'photo' ? 'Foto' : 'Audio'}
                            </Badge>
                            <ChevronRight className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      </div>
                      {index < recentComments.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {topPhotos.length === 0 ? (
                  <div className="text-center py-8">
                    <Heart className="h-8 w-8 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500">Nessuna foto con like</p>
                  </div>
                ) : (
                  topPhotos.map((photo, index) => (
                    <div key={photo.id} className="group">
                      <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center w-8 h-8 flex-shrink-0">
                          {getRankIcon(index)}
                        </div>
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <img 
                            src={photo.url} 
                            alt={photo.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate mb-1">
                            {photo.name || 'Foto senza nome'}
                          </p>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Heart className="h-3 w-3 text-red-500" />
                              <span>{photo.likesCount}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageCircle className="h-3 w-3 text-blue-500" />
                              <span>{photo.commentsCount}</span>
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      {index < topPhotos.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
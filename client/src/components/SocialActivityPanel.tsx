import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { createUrl } from '@/lib/config';
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
import { Comment, VoiceMemo } from '@shared/schema';
import VoiceMemoUpload from './VoiceMemoUpload';

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
  userEmail?: string;
  userName?: string;
  onPhotoClick?: (photoId: string) => void;
}

export default function SocialActivityPanel({ galleryId, className = '', userEmail, userName, onPhotoClick }: SocialActivityPanelProps) {
  const [recentComments, setRecentComments] = useState<Comment[]>([]);
  const [topPhotos, setTopPhotos] = useState<PhotoStats[]>([]);
  const [recentVoiceMemos, setRecentVoiceMemos] = useState<VoiceMemo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showVoiceMemoUpload, setShowVoiceMemoUpload] = useState(false);

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
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/comments/recent`));
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
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/photos/top-liked`));
      if (response.ok) {
        const data = await response.json();
        setTopPhotos(data.slice(0, 5)); // Top 5 photos
      }
    } catch (error) {
      console.error('Error fetching top photos:', error);
    }
  };

  const fetchRecentVoiceMemos = async () => {
    try {
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/voice-memos/recent`));
      if (response.ok) {
        const data = await response.json();
        setRecentVoiceMemos(data.slice(0, 5)); // Recent 5 voice memos
      }
    } catch (error) {
      console.error('Error fetching recent voice memos:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([
        fetchRecentComments(),
        fetchTopPhotos(),
        fetchRecentVoiceMemos()
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
    <>
    <div className={`${className} grid grid-cols-1 lg:grid-cols-3 gap-4`}>
      {/* Recent Comments Section */}
      <Card className="border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-blue-600" />
            Commenti Recenti
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-64">
            <div className="p-4">
              {recentComments.length === 0 ? (
                <div className="text-center py-4">
                  <MessageCircle className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Nessun commento</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentComments.map((comment, index) => (
                    <div key={comment.id} className="group">
                      <div 
                        className={`p-2 rounded-lg hover:bg-gray-50 transition-colors ${
                          comment.itemType === 'photo' && onPhotoClick ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => {
                          if (comment.itemType === 'photo' && onPhotoClick) {
                            onPhotoClick(comment.itemId);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-sage-100 to-blue-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <User className="h-3 w-3 text-sage-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-gray-900 truncate">
                                {comment.userName}
                              </p>
                              <span className="text-xs text-gray-500">
                                {formatDateTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-1">
                              {comment.content}
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs px-1 py-0">
                                {comment.itemType === 'photo' ? 'Foto' : 'Audio'}
                              </Badge>
                              {comment.itemType === 'photo' && (comment as any).photoName && (
                                <span className="text-xs text-gray-500 truncate">
                                  su "{(comment as any).photoName}"
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {index < recentComments.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Top Photos Section */}
      <Card className="border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Heart className="h-4 w-4 text-red-600" />
            Foto Top
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-64">
            <div className="p-4">
              {topPhotos.length === 0 ? (
                <div className="text-center py-4">
                  <Heart className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs text-gray-500">Nessuna foto con like</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topPhotos.map((photo, index) => (
                    <div key={photo.id} className="group">
                      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center w-6 h-6 flex-shrink-0">
                          {getRankIcon(index)}
                        </div>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          <img 
                            src={photo.url} 
                            alt={photo.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 truncate mb-1">
                            {photo.name || 'Foto senza nome'}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <div className="flex items-center gap-1">
                              <Heart className="h-2 w-2 text-red-500" />
                              <span>{photo.likesCount}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <MessageCircle className="h-2 w-2 text-blue-500" />
                              <span>{photo.commentsCount}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recent Voice Memos Section */}
      <Card className="border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Note Audio
            </CardTitle>
            <button
              onClick={() => setShowVoiceMemoUpload(true)}
              className="text-purple-600 hover:text-purple-700 transition-colors p-1 rounded-full hover:bg-purple-50"
              title="Aggiungi nota audio"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-64">
            <div className="p-4">
              {recentVoiceMemos.length === 0 ? (
                <div className="text-center py-4">
                  <svg className="h-6 w-6 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-xs text-gray-500">Nessuna nota audio</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentVoiceMemos.map((memo, index) => (
                    <div key={memo.id} className="group">
                      <div className="p-2 rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="w-6 h-6 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="h-3 w-3 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-gray-900 truncate">
                                {memo.guestName}
                              </p>
                              <span className="text-xs text-gray-500">
                                {formatDateTime(memo.createdAt)}
                              </span>
                            </div>
                            {memo.message && (
                              <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-1">
                                {memo.message}
                              </p>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                  Audio
                                </Badge>
                                {memo.duration && (
                                  <span className="text-xs text-gray-500">
                                    {Math.floor(memo.duration / 60)}:{(memo.duration % 60).toString().padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                              {(memo as any).audioUrl && (
                                <audio 
                                  controls 
                                  className="h-6 w-16"
                                  preload="none"
                                >
                                  <source src={(memo as any).audioUrl} type="audio/webm" />
                                  <source src={(memo as any).audioUrl} type="audio/mpeg" />
                                  Il tuo browser non supporta l'elemento audio.
                                </audio>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      {index < recentVoiceMemos.length - 1 && <Separator className="my-1" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    {/* Voice Memo Upload Modal */}
    {showVoiceMemoUpload && (
      <VoiceMemoUpload
        galleryId={galleryId}
        galleryName="Galleria"
        userEmail={userEmail}
        userName={userName}
        onUploadComplete={() => {
          setShowVoiceMemoUpload(false);
          // Refresh voice memos list
          fetchRecentVoiceMemos();
        }}
      />
    )}
    </>
  );
}
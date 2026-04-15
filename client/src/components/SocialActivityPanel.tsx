import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { createUrl } from '@/lib/basePath';
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
import UserAvatar from './UserAvatar';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { LikeService } from '@/lib/likes';
import { CommentService } from '@/lib/comments';
import { useToast } from '@/hooks/use-toast';
import UnifiedAuthDialog from './auth/UnifiedAuthDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Timestamp } from 'firebase/firestore';

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
  onPhotoClick?: (photoId: string) => void;
}

export default function SocialActivityPanel({ galleryId, className = '', onPhotoClick }: SocialActivityPanelProps) {
  const [recentComments, setRecentComments] = useState<Comment[]>([]);
  const [topPhotos, setTopPhotos] = useState<PhotoStats[]>([]);
  const [recentVoiceMemos, setRecentVoiceMemos] = useState<VoiceMemo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showVoiceMemoUpload, setShowVoiceMemoUpload] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedPhotoForComment, setSelectedPhotoForComment] = useState<string | null>(null);
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const [likedPhotos, setLikedPhotos] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  
  const { user, userProfile } = useFirebaseAuth();
  const { toast } = useToast();

  const formatDateTime = (timestamp: Timestamp | Date | string | number | null | undefined): string => {
    try {
      let date: Date;
      
      if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as any).toDate === 'function') {
        date = (timestamp as any).toDate();
      } else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp && typeof (timestamp as any).seconds === 'number') {
        date = new Date((timestamp as any).seconds * 1000);
      } else if (timestamp) {
        date = new Date(timestamp as string | number | Date);
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
      // Import Firebase functions directly
      const { getRecentComments } = await import('@/lib/comments');
      const data = await getRecentComments(galleryId, 8);
      
      // Map the comment structure to match the expected interface
      const mappedComments = data.map(comment => ({
        id: comment.id,
        itemId: comment.photoId, // Map photoId to itemId
        itemType: 'photo' as const,
        galleryId: comment.galleryId,
        userEmail: comment.userEmail,
        userName: comment.userName,
        userProfileImageUrl: comment.userProfileImageUrl,
        content: comment.text, // Map text to content
        text: comment.text, // Keep text for backward compatibility
        createdAt: comment.createdAt
      })) as Comment[];
      
      setRecentComments(mappedComments);
    } catch (error) {
      console.error('Error fetching recent comments:', error);
    }
  };

  const fetchTopPhotos = async () => {
    try {
      // Import Firebase functions directly from firebase-api
      const { getTopLikedPhotos } = await import('@/lib/firebase-api');
      const data = await getTopLikedPhotos(galleryId, 5);
      
      // Converti i dati nel formato atteso dal componente
      const formattedData = data.map(photo => ({
        id: photo.id,
        name: photo.name,
        url: photo.url,
        likesCount: photo.likes || 0,
        commentsCount: photo.comments || 0
      }));
      
      setTopPhotos(formattedData);
    } catch (error) {
      console.error('Error fetching top photos:', error);
    }
  };

  const fetchRecentVoiceMemos = async () => {
    try {
      // Import Firebase functions directly
      const { getRecentVoiceMemos } = await import('@/lib/voiceMemos');
      const data = await getRecentVoiceMemos(galleryId, 5);
      setRecentVoiceMemos(data);
    } catch (error) {
      console.error('Error fetching recent voice memos:', error);
    }
  };

  const handleLikePhoto = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      setShowAuthDialog(true);
      return;
    }

    try {
      const userName = userProfile?.displayName || user.displayName || user.email?.split('@')[0] || 'Ospite';
      
      const isNowLiked = await LikeService.toggleLike(
        photoId, 
        user.uid, 
        user.email!, 
        userName
      );
      
      if (isNowLiked) {
        setLikedPhotos(prev => new Set([...prev, photoId]));
      } else {
        setLikedPhotos(prev => {
          const newSet = new Set(prev);
          newSet.delete(photoId);
          return newSet;
        });
      }
      
      // Aggiorna conteggio like localmente
      setTopPhotos(prev => prev.map(photo => 
        photo.id === photoId 
          ? { ...photo, likesCount: photo.likesCount + (isNowLiked ? 1 : -1) }
          : photo
      ));
      
      toast({
        title: isNowLiked ? "Like aggiunto!" : "Like rimosso",
        description: isNowLiked ? "Hai messo like a questa foto" : "Hai rimosso il like da questa foto"
      });
    } catch (error) {
      console.error('Errore nel like:', error);
      toast({
        title: "Errore",
        description: "Non è stato possibile aggiungere il like",
        variant: "destructive"
      });
    }
  };

  const handleCommentPhoto = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!user) {
      setShowAuthDialog(true);
      return;
    }
    
    setSelectedPhotoForComment(photoId);
  };

  const handleCommentSuccess = (photoId: string) => {
    // Aggiorna conteggio commenti localmente
    setTopPhotos(prev => prev.map(photo => 
      photo.id === photoId 
        ? { ...photo, commentsCount: photo.commentsCount + 1 }
        : photo
    ));
    
    // Ricarica commenti recenti
    fetchRecentComments();
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) {
      toast({
        title: "Errore",
        description: "Il commento non può essere vuoto",
        variant: "destructive"
      });
      return;
    }

    if (!user || !selectedPhotoForComment) return;

    try {
      setIsSubmittingComment(true);
      
      await CommentService.addComment({
        galleryId,
        photoId: selectedPhotoForComment,
        itemId: selectedPhotoForComment,
        itemType: 'photo',
        userId: user.uid,
        userEmail: user.email!,
        userName: userProfile?.displayName || user.displayName || user.email?.split('@')[0] || 'Ospite',
        userProfileImageUrl: userProfile?.profileImageUrl,
        content: commentText.trim()
      });

      toast({
        title: "Commento aggiunto",
        description: "Il tuo commento è stato pubblicato"
      });

      handleCommentSuccess(selectedPhotoForComment);
      setCommentText('');
      setSelectedPhotoForComment(null);
    } catch (error) {
      console.error('Errore invio commento:', error);
      toast({
        title: "Errore",
        description: "Non è stato possibile aggiungere il commento",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingComment(false);
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
    
    // Refresh data every 5 minutes to reduce server load
    const interval = setInterval(loadData, 300000);
    return () => clearInterval(interval);
  }, [galleryId]);

  // Carica stato like per l'utente corrente
  useEffect(() => {
    if (user && topPhotos.length > 0) {
      const checkLikes = async () => {
        const likedSet = new Set<string>();
        for (const photo of topPhotos) {
          const isLiked = await LikeService.isPhotoLikedByUser(photo.id, user.uid);
          if (isLiked) {
            likedSet.add(photo.id);
          }
        }
        setLikedPhotos(likedSet);
      };
      checkLikes();
    }
  }, [user, topPhotos]);

  // Auto-slide for comments
  useEffect(() => {
    if (recentComments.length > 3) {
      const slideInterval = setInterval(() => {
        setCurrentSlide(prev => (prev + 1) % Math.ceil(recentComments.length / 3));
      }, 4000);
      return () => clearInterval(slideInterval);
    }
  }, [recentComments.length]);

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
    <div className={`${className} grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4`}>
      {/* Recent Comments Section */}
      <Card className="border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm sm:shadow-lg overflow-hidden">
        <CardHeader className="pb-2 px-4">
          <CardTitle className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-blue-600" />
            Commenti Recenti
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-56 sm:h-64">
            <div className="px-3 sm:px-4 pb-3">
              {recentComments.length === 0 ? (
                <div className="text-center py-8">
                  <MessageCircle className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Nessun commento</p>
                </div>
              ) : (
                <div className="relative overflow-hidden">
                  <div 
                    className="flex transition-transform duration-500 ease-in-out"
                    style={{ transform: `translateX(-${currentSlide * 100}%)` }}
                  >
                    {Array.from({ length: Math.ceil(recentComments.length / 3) }, (_, slideIndex) => (
                      <div key={slideIndex} className="w-full flex-shrink-0 space-y-1">
                        {recentComments.slice(slideIndex * 3, (slideIndex + 1) * 3).map((comment) => (
                          <button 
                            key={comment.id} 
                            className="w-full text-left p-2.5 sm:p-2 rounded-xl active:bg-gray-100 sm:hover:bg-gray-50 transition-colors touch-manipulation"
                            onClick={() => {
                              if (comment.itemId && onPhotoClick) {
                                onPhotoClick(comment.itemId);
                              }
                            }}
                          >
                            <div className="flex items-start gap-2.5">
                              <UserAvatar
                                userEmail={comment.userEmail}
                                userName={comment.userName}
                                userProfileImageUrl={comment.userProfileImageUrl}
                                size="sm"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2 mb-0.5">
                                  <p className="text-[13px] font-semibold text-gray-900 truncate">
                                    {comment.userName}
                                  </p>
                                  <span className="text-[11px] text-gray-400 flex-shrink-0">
                                    {formatDateTime(comment.createdAt)}
                                  </span>
                                </div>
                                <p className="text-[13px] text-gray-600 line-clamp-2 leading-relaxed">
                                  {(comment as any).text || comment.content || ''}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                  
                  {recentComments.length > 3 && (
                    <div className="flex justify-center mt-3 gap-1.5">
                      {Array.from({ length: Math.ceil(recentComments.length / 3) }, (_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentSlide(index)}
                          className={`h-2 rounded-full transition-all touch-manipulation ${
                            index === currentSlide ? 'bg-sage-600 w-5' : 'bg-gray-300 w-2'
                          }`}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Top Photos Section */}
      <Card className="border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm sm:shadow-lg overflow-hidden">
        <CardHeader className="pb-2 px-4">
          <CardTitle className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
            <Heart className="h-4 w-4 text-red-500" />
            Foto Top
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-56 sm:h-64">
            <div className="px-3 sm:px-4 pb-3">
              {topPhotos.length === 0 ? (
                <div className="text-center py-8">
                  <Heart className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Nessun like ancora</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {topPhotos.map((photo, index) => (
                    <div 
                      key={photo.id} 
                      className="p-2 rounded-xl active:bg-gray-100 sm:hover:bg-gray-50 transition-colors touch-manipulation"
                      role="group"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="flex items-center justify-center w-7 h-7 flex-shrink-0 cursor-pointer"
                          onClick={() => onPhotoClick?.(photo.id)}
                        >
                          {getRankIcon(index)}
                        </div>
                        <div 
                          className="w-14 h-14 sm:w-12 sm:h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0 shadow-sm cursor-pointer"
                          onClick={() => onPhotoClick?.(photo.id)}
                        >
                          <img 
                            src={photo.url} 
                            alt={photo.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p 
                            className="text-[13px] font-medium text-gray-900 truncate mb-1.5 cursor-pointer"
                            onClick={() => onPhotoClick?.(photo.id)}
                          >
                            {photo.name || 'Foto senza nome'}
                          </p>
                          <div className="flex items-center gap-4 text-[13px] text-gray-500">
                            <button
                              onClick={(e) => handleLikePhoto(photo.id, e)}
                              aria-label={`Mi piace foto ${photo.name || ''}`}
                              className={`flex items-center gap-1.5 min-h-[44px] active:scale-95 transition-transform touch-manipulation ${
                                likedPhotos.has(photo.id) ? 'text-red-500' : ''
                              }`}
                            >
                              <Heart className={`h-4 w-4 ${likedPhotos.has(photo.id) ? 'fill-current' : ''}`} />
                              <span className="font-semibold">{photo.likesCount}</span>
                            </button>
                            <button
                              onClick={(e) => handleCommentPhoto(photo.id, e)}
                              aria-label={`Commenta foto ${photo.name || ''}`}
                              className="flex items-center gap-1.5 min-h-[44px] active:scale-95 transition-transform touch-manipulation hover:text-blue-600"
                            >
                              <MessageCircle className="h-4 w-4" />
                              <span className="font-semibold">{photo.commentsCount}</span>
                            </button>
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
      <Card className="border-gray-200 bg-white/95 backdrop-blur-sm shadow-sm sm:shadow-lg overflow-hidden">
        <CardHeader className="pb-2 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm sm:text-base font-semibold text-gray-900 flex items-center gap-2">
              <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Note Audio
            </CardTitle>
            <button
              onClick={() => setShowVoiceMemoUpload(true)}
              className="h-11 w-11 flex items-center justify-center text-purple-600 hover:text-purple-700 rounded-full hover:bg-purple-50 active:bg-purple-100 transition-colors touch-manipulation"
              aria-label="Aggiungi nota audio"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-56 sm:h-64">
            <div className="px-3 sm:px-4 pb-3">
              {recentVoiceMemos.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="h-8 w-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <p className="text-sm text-gray-400">Nessuna nota audio</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentVoiceMemos.map((memo, index) => (
                    <div key={memo.id}>
                      <div className="p-2.5 sm:p-2 rounded-xl active:bg-gray-50 sm:hover:bg-gray-50 transition-colors touch-manipulation">
                        <div className="flex items-start gap-2.5">
                          <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <svg className="h-4 w-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline justify-between gap-2 mb-0.5">
                              <p className="text-[13px] font-semibold text-gray-900 truncate">
                                {memo.guestName}
                              </p>
                              <span className="text-[11px] text-gray-400 flex-shrink-0">
                                {formatDateTime(memo.createdAt)}
                              </span>
                            </div>
                            {memo.message && (
                              <p className="text-[13px] text-gray-600 line-clamp-2 leading-relaxed mb-1">
                                {memo.message}
                              </p>
                            )}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[11px] px-1.5 py-0.5 border-purple-200 text-purple-600">
                                  Audio
                                </Badge>
                                {memo.duration && (
                                  <span className="text-[12px] text-gray-400">
                                    {Math.floor(memo.duration / 60)}:{(memo.duration % 60).toString().padStart(2, '0')}
                                  </span>
                                )}
                              </div>
                              {(memo as any).audioUrl && (
                                <button
                                  onClick={() => {
                                    const audio = new Audio((memo as any).audioUrl);
                                    audio.play().catch(console.error);
                                  }}
                                  className="flex items-center gap-1 h-7 px-2.5 text-[12px] text-purple-600 hover:text-purple-700 active:bg-purple-100 hover:bg-purple-50 rounded-full transition-colors touch-manipulation"
                                  title="Ascolta audio"
                                >
                                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                  Play
                                </button>
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
        onUploadComplete={() => {
          setShowVoiceMemoUpload(false);
          // Refresh voice memos list
          fetchRecentVoiceMemos();
        }}
      />
    )}
    
    {/* Comment Dialog */}
    <Dialog open={!!selectedPhotoForComment} onOpenChange={(open) => !open && setSelectedPhotoForComment(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Aggiungi un commento
          </DialogTitle>
          <DialogDescription>
            Condividi i tuoi pensieri su questa foto
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Scrivi il tuo commento..."
            className="min-h-[100px] resize-none"
            maxLength={500}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-gray-500">
              {commentText.length}/500 caratteri
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedPhotoForComment(null);
                  setCommentText('');
                }}
              >
                Annulla
              </Button>
              <Button
                onClick={handleSubmitComment}
                disabled={!commentText.trim() || isSubmittingComment}
              >
                {isSubmittingComment ? (
                  <>
                    <span className="animate-spin h-4 w-4 mr-2">⏳</span>
                    Invio...
                  </>
                ) : (
                  'Invia'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Auth Dialog */}
    {showAuthDialog && (
      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={(open) => setShowAuthDialog(open)}
        galleryId={galleryId}
        onAuthComplete={() => {
          setShowAuthDialog(false);
          // Refresh data after auth
          fetchRecentComments();
          fetchTopPhotos();
          fetchRecentVoiceMemos();
        }}
      />
    )}
    </>
  );
}
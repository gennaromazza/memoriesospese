import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { 
  Heart, 
  MessageCircle, 
} from 'lucide-react';
import CommentModal from './CommentModal';
import UnifiedAuthDialog from './auth/UnifiedAuthDialog';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { useGalleryInteractions } from '@/context/GalleryInteractionsContext';
import { LikeService } from '@/lib/likes';
import { CommentService, Comment } from '@/lib/comments';

interface InteractionPanelProps {
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  isAdmin?: boolean;
  userEmail?: string;
  userName?: string;
  className?: string;
  onAuthRequired?: () => void;
  variant?: 'default' | 'floating';
  isOpen?: boolean;
  onClose?: () => void;
}

export default function InteractionPanel({
  itemId,
  itemType,
  galleryId,
  isAdmin = false,
  className = '',
  onAuthRequired,
  variant = 'default'
}: InteractionPanelProps) {
  const [stats, setStats] = useState({
    likesCount: 0,
    commentsCount: 0,
    hasUserLiked: false
  });
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [showAuthDialog, setShowAuthDialog] = useState(false);

  const { user, userProfile, isAuthenticated } = useFirebaseAuth();
  const { toast } = useToast();
  // Se siamo dentro un GalleryInteractionsProvider, leggiamo le stats dalla mappa
  // pre-caricata invece di fare 3 query Firestore per ogni foto.
  const galleryInteractions = useGalleryInteractions();

  const userEmail = user?.email || '';
  const userName = userProfile?.displayName || user?.displayName || (userEmail ? userEmail.split('@')[0] : 'Utente');

  // Il provider precarica SOLO foto: per voice_memo o altri tipi facciamo
  // sempre il fetch legacy per non perdere likes/commenti registrati.
  const canUseProvider = !!galleryInteractions && itemType === 'photo';

  const fetchStats = async () => {
    // 🚀 Se il provider è disponibile per questo tipo, niente fetch: leggiamo dalla mappa.
    if (canUseProvider) {
      const s = galleryInteractions!.getStats(itemId);
      setStats(s);
      setIsLoadingStats(!galleryInteractions!.isReady);
      return;
    }
    try {
      setIsLoadingStats(true);
      
      const [likesCount, commentsCount, hasUserLiked] = await Promise.all([
        LikeService.getPhotoLikesCount(itemId),
        CommentService.getPhotoCommentsCount(itemId),
        isAuthenticated ? LikeService.isPhotoLikedByUser(itemId, user!.uid) : false
      ]);

      setStats({
        likesCount,
        commentsCount,
        hasUserLiked
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      setStats({
        likesCount: 0,
        commentsCount: 0,
        hasUserLiked: false
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  const fetchComments = async () => {
    try {
      setIsLoadingStats(true);
      
      const comments = await CommentService.getPhotoComments(itemId);
      setComments(comments);
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated || !user) {
      setShowAuthDialog(true);
      return;
    }

    try {
      setIsLoading(true);
      
      const isNowLiked = await LikeService.toggleLike(itemId, user.uid, userEmail, userName);
      
      setStats(prev => ({
        ...prev,
        hasUserLiked: isNowLiked,
        likesCount: isNowLiked 
          ? prev.likesCount + 1 
          : Math.max(0, prev.likesCount - 1)
      }));
      // Sync con la mappa galleria-wide se disponibile
      galleryInteractions?.applyLikeDelta(itemId, isNowLiked);

      toast({
        title: isNowLiked ? 'Like aggiunto' : 'Like rimosso',
        description: '',
      });
    } catch (error) {
      console.error('Errore like:', error);
      toast({
        title: 'Errore',
        description: 'Errore nella gestione del like',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) {
      toast({
        title: "Errore",
        description: "Il commento non può essere vuoto",
        variant: "destructive"
      });
      return;
    }

    if (!isAuthenticated || !user) {
      setShowAuthDialog(true);
      return;
    }

    try {
      setIsSubmittingComment(true);

      const finalUserEmail = user.email || '';
      const finalUserName = userProfile?.displayName || user.displayName || finalUserEmail.split('@')[0];

      const commentId = await CommentService.addComment({
        galleryId, 
        itemId: itemId,
        itemType: itemType,
        userId: user.uid, 
        userEmail: finalUserEmail, 
        userName: finalUserName,
        userProfileImageUrl: userProfile?.profileImageUrl,
        content: newComment.trim()
      });

      const newCommentData: Comment = {
        id: commentId,
        galleryId,
        itemId,
        itemType,
        userId: user.uid,
        userEmail: finalUserEmail,
        userName: finalUserName,
        userProfileImageUrl: userProfile?.profileImageUrl,
        content: newComment.trim(),
        text: newComment.trim(),
        createdAt: new Date()
      };

      setComments(prev => [newCommentData, ...prev]);

      setStats(prev => ({
        ...prev,
        commentsCount: prev.commentsCount + 1
      }));
      galleryInteractions?.applyCommentDelta(itemId, 1);

      setNewComment('');

      toast({
        title: 'Successo',
        description: 'Commento aggiunto con successo',
      });
    } catch (error) {
      console.error('Errore nell\'aggiunta commento:', error);
      toast({
        title: 'Errore',
        description: 'Errore nell\'aggiunta del commento',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin) return;

    try {
      await CommentService.deleteComment(commentId);

      setComments(prev => prev.filter(comment => comment.id !== commentId));

      setStats(prev => ({
        ...prev,
        commentsCount: Math.max(0, prev.commentsCount - 1)
      }));
      galleryInteractions?.applyCommentDelta(itemId, -1);

      toast({
        title: 'Successo',
        description: 'Commento eliminato con successo',
      });
    } catch (error) {
      console.error('Errore nell\'eliminazione commento:', error);
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Errore nell\'eliminazione del commento',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchStats();
    // Quando il provider è disponibile per le foto, ascoltiamo anche cambi di
    // getStats/isReady per riflettere immediatamente prefetch e mutazioni cross-foto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    itemId,
    itemType,
    galleryId,
    userEmail,
    canUseProvider,
    canUseProvider ? galleryInteractions?.isReady : null,
    canUseProvider ? galleryInteractions?.getStats : null,
  ]);

  const handleAuthSuccess = () => {
    setShowAuthDialog(false);
    fetchStats();
  };

  if (variant === 'floating') {
    return (
      <>
        <div className="flex gap-1.5">
          <button
            onClick={handleLike}
            disabled={isLoading || isLoadingStats}
            className={`flex items-center gap-1 h-10 min-w-[44px] px-2.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md active:scale-95 transition-all touch-manipulation ${
              stats.hasUserLiked
                ? 'text-red-500'
                : 'text-gray-600'
            }`}
          >
            <Heart 
              className={`h-[18px] w-[18px] ${stats.hasUserLiked ? 'fill-current' : ''}`} 
            />
            {stats.likesCount > 0 && (
              <span className="text-xs font-semibold">{stats.likesCount}</span>
            )}
          </button>

          <button
            onClick={() => {
              if (!isAuthenticated || !user) {
                setShowAuthDialog(true);
                return;
              }
              setShowCommentModal(true);
              fetchComments();
            }}
            className="flex items-center gap-1 h-10 min-w-[44px] px-2.5 rounded-full bg-white/90 backdrop-blur-sm shadow-md text-gray-600 active:scale-95 transition-all touch-manipulation"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
            {stats.commentsCount > 0 && (
              <span className="text-xs font-semibold">{stats.commentsCount}</span>
            )}
          </button>
        </div>

        <CommentModal
          isOpen={showCommentModal}
          onOpenChange={setShowCommentModal}
          comments={comments}
          newComment={newComment}
          onNewCommentChange={setNewComment}
          onSubmitComment={handleSubmitComment}
          onDeleteComment={handleDeleteComment}
          isSubmitting={isSubmittingComment}
          isAdmin={isAdmin}
          userEmail={userEmail}
          userName={userName}
        />

        <UnifiedAuthDialog
          isOpen={showAuthDialog}
          onOpenChange={setShowAuthDialog}
          galleryId={galleryId}
          onAuthComplete={handleAuthSuccess}
        />
      </>
    );
  }

  return (
    <div className={`${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleLike}
          disabled={isLoading || isLoadingStats}
          className={`flex items-center gap-1.5 h-10 px-3.5 rounded-full active:scale-95 transition-all touch-manipulation ${
            stats.hasUserLiked 
              ? 'text-red-600 bg-red-50' 
              : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
          }`}
        >
          <Heart className={`h-[18px] w-[18px] ${stats.hasUserLiked ? 'fill-current' : ''}`} />
          {!isLoadingStats && stats.likesCount > 0 && (
            <span className="text-sm font-medium tabular-nums">
              {stats.likesCount}
            </span>
          )}
        </button>

        <button
          onClick={() => {
            if (!isAuthenticated || !user) {
              setShowAuthDialog(true);
              return;
            }
            setShowCommentModal(true);
            fetchComments();
          }}
          className="flex items-center gap-1.5 h-10 px-3.5 rounded-full text-gray-500 hover:text-blue-600 hover:bg-blue-50 active:scale-95 transition-all touch-manipulation"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
          {!isLoadingStats && stats.commentsCount > 0 && (
            <span className="text-sm font-medium tabular-nums">
              {stats.commentsCount}
            </span>
          )}
        </button>
      </div>

      <CommentModal
        isOpen={showCommentModal}
        onOpenChange={setShowCommentModal}
        comments={comments}
        newComment={newComment}
        onNewCommentChange={setNewComment}
        onSubmitComment={handleSubmitComment}
        onDeleteComment={handleDeleteComment}
        isSubmitting={isSubmittingComment}
        isAdmin={isAdmin}
        userEmail={userEmail}
        userName={userName}
      />

      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={handleAuthSuccess}
      />
    </div>
  );
}
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Heart, 
  MessageCircle, 
  Send, 
  Trash2,
  User,
  Clock,
  LogIn,
  UserPlus
} from 'lucide-react';
import CommentModal from './CommentModal';
import UnifiedAuthDialog from './auth/UnifiedAuthDialog';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { LikeService } from '@/lib/likes';
import { CommentService, Comment } from '@/lib/comments';
import { PhotoService } from '@/lib/photos';
import { RealtimeService } from '@/lib/realtime';
import { Timestamp } from 'firebase/firestore';

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

  // Get authentication data from centralized system
  const userEmail = user?.email || '';
  const userName = userProfile?.displayName || user?.displayName || (userEmail ? userEmail.split('@')[0] : 'Utente');



  // Fetch interaction stats using Firebase services
  const fetchStats = async () => {
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
      // Set default stats on error
      setStats({
        likesCount: 0,
        commentsCount: 0,
        hasUserLiked: false
      });
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch comments using Firebase services
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

  // Handle authentication requirement
  const handleAuthRequired = () => {
    setShowAuthDialog(true);
    onAuthRequired?.();
  };

  // Handle like functionality using Firebase services
  const handleLike = async () => {
    // Verifica autenticazione
    if (!isAuthenticated || !user) {
      handleAuthRequired();
      return;
    }

    try {
      setIsLoading(true);
      
      const isNowLiked = await LikeService.toggleLike(itemId, user.uid, userEmail, userName);
      
      // Update stats based on action
      setStats(prev => ({
        ...prev,
        hasUserLiked: isNowLiked,
        likesCount: isNowLiked 
          ? prev.likesCount + 1 
          : Math.max(0, prev.likesCount - 1)
      }));

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

  // Handle comment submission using Firebase services
  const handleSubmitComment = async () => {
    if (!newComment.trim()) {
      toast({
        title: "Errore",
        description: "Il commento non può essere vuoto",
        variant: "destructive"
      });
      return;
    }

    // Verifica autenticazione Firebase
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
        text: newComment.trim()
      });

      const newCommentData = {
        id: commentId,
        galleryId,
        photoId: itemId,
        userId: user.uid,
        userEmail: finalUserEmail,
        userName: finalUserName,
        userProfileImageUrl: userProfile?.profileImageUrl,
        text: newComment.trim(),
        createdAt: new Date()
      };

      // Add comment to local state
      setComments(prev => [newCommentData, ...prev]);

      // Update stats
      setStats(prev => ({
        ...prev,
        commentsCount: prev.commentsCount + 1
      }));

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

  // Handle comment deletion (admin only) using Firebase services
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin) return;

    try {
      await CommentService.deleteComment(commentId);

      // Remove comment from local state
      setComments(prev => prev.filter(comment => comment.id !== commentId));

      // Update stats
      setStats(prev => ({
        ...prev,
        commentsCount: Math.max(0, prev.commentsCount - 1)
      }));

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

  // Format date helper
  const formatDate = (timestamp: Timestamp | Date | string | number | null | undefined): string => {
    try {
      let date: Date;

      if (timestamp?.toDate) {
        // Firestore Timestamp
        date = timestamp.toDate();
      } else if (timestamp?.seconds) {
        // Firestore Timestamp object
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp) {
        // Regular Date or string
        date = new Date(timestamp);
      } else {
        return 'Data non disponibile';
      }

      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Data non disponibile';
    }
  };

  // Initial data loading
  useEffect(() => {
    fetchStats();
  }, [itemId, itemType, galleryId, userEmail]);

  const handleAuthSuccess = () => {
    setShowAuthDialog(false);
    fetchStats();
  };

  if (variant === 'floating') {
    return (
      <>
        <div className="flex gap-1">
          {/* Like button - floating */}
          <Button
            onClick={handleLike}
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 rounded-full bg-white/90 backdrop-blur-sm shadow-sm ${
              stats.hasUserLiked
                ? 'text-red-500 hover:text-red-600 hover:bg-red-50'
                : 'text-gray-600 hover:text-red-500 hover:bg-red-50'
            }`}
            disabled={isLoading || isLoadingStats}
          >
            <Heart 
              className={`h-4 w-4 ${stats.hasUserLiked ? 'fill-current' : ''}`} 
            />
          </Button>

          {/* Comments button - floating */}
          <Button
            onClick={() => {
              setShowCommentModal(true);
              fetchComments();
            }}
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full bg-white/90 backdrop-blur-sm shadow-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50"
          >
            <MessageCircle className="h-4 w-4" />
          </Button>
        </div>

        {/* Comment Modal */}
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

        {/* Authentication Dialog */}
        <UnifiedAuthDialog
          isOpen={showAuthDialog}
          onOpenChange={setShowAuthDialog}
          galleryId={galleryId}
          onAuthComplete={handleAuthSuccess}
        />
      </>
    );
  }

  // Combined authentication check - ensure we have proper user identification
  const hasFirebaseAuth = isAuthenticated && user && userEmail;
  const hasLocalAuth = !isAuthenticated && userEmail && userName;
  const hasAuth = hasFirebaseAuth || hasLocalAuth;



  return (
    <div className={`space-y-3 ${className}`}>
      {/* Like and comment buttons */}
      <div className="flex items-center gap-4">
        <Button
          onClick={handleLike}
          disabled={isLoading || isLoadingStats}
          variant="ghost"
          size="sm"
          className={`h-8 px-3 ${stats.hasUserLiked 
            ? 'text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100' 
            : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
          }`}
        >
          <Heart className={`h-4 w-4 mr-1 ${stats.hasUserLiked ? 'fill-current' : ''}`} />
          <span className="text-sm font-medium">
            {isLoadingStats ? '...' : stats.likesCount}
          </span>
        </Button>

        <Button
          onClick={() => {
            setShowCommentModal(true);
            fetchComments();
          }}
          variant="ghost"
          size="sm"
          className="h-8 px-3 text-gray-600 hover:text-blue-600 hover:bg-blue-50"
        >
          <MessageCircle className="h-4 w-4 mr-1" />
          <span className="text-sm font-medium">
            {isLoadingStats ? '...' : stats.commentsCount}
          </span>
        </Button>
      </div>

      

      {/* Authentication prompt */}
      {!hasAuth && (
        <Card className="border-sage/30 bg-sage/10 mt-3">
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sage-700 text-sm">
                <User className="h-4 w-4" />
                <span>Accedi per mettere like e commentare</span>
              </div>
              <Button
                onClick={handleAuthRequired}
                size="sm"
                className="bg-sage hover:bg-sage/80 text-white shadow-sm"
              >
                <LogIn className="h-4 w-4 mr-1" />
                Accedi
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comment Modal */}
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

      {/* Authentication Dialog */}
      <UnifiedAuthDialog
        isOpen={showAuthDialog}
        onOpenChange={setShowAuthDialog}
        galleryId={galleryId}
        onAuthComplete={handleAuthSuccess}
      />
    </div>
  );
}
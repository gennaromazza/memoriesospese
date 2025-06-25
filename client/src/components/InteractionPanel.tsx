import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { createUrl } from '@/lib/config';
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
import { Comment, InteractionStats } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';

interface InteractionPanelProps {
  itemId: string;
  itemType: 'photo' | 'voice_memo';
  galleryId: string;
  userEmail?: string;
  userName?: string;
  isAdmin?: boolean;
  className?: string;
  onAuthRequired?: () => void;
}

export default function InteractionPanel({
  itemId,
  itemType,
  galleryId,
  isAdmin = false,
  className = '',
  onAuthRequired
}: InteractionPanelProps) {
  const [stats, setStats] = useState<InteractionStats>({
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

  const { user, userProfile, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Get user data from Firebase Auth
  const userEmail = user?.email || '';
  const userName = userProfile?.displayName || user?.displayName || '';

  // Fetch interaction stats
  const fetchStats = async () => {
    try {
      setIsLoadingStats(true);
      const url = `/api/galleries/${galleryId}/stats/${itemType}/${itemId}${userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : ''}`;
      const response = await fetch(createUrl(url));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore nel caricamento statistiche' }));
        throw new Error(errorData.error || 'Errore nel caricamento statistiche');
      }

      const result = await response.json();
      const data = result.success ? result.data : result; // Handle both standardized and legacy response formats
      setStats(data);
    } catch (error) {
      console.error('Errore nel caricamento statistiche:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Fetch comments
  const fetchComments = async () => {
    try {
      setIsLoadingStats(true);
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/comments/${itemType}/${itemId}`));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore nel caricamento commenti' }));
        throw new Error(errorData.error || 'Errore nel caricamento commenti');
      }

      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error('Errore nel caricamento commenti:', error);
    } finally {
      setIsLoadingStats(false);
    }
  };

  // Handle like functionality
  const handleLike = async () => {
    if (!isAuthenticated || !userEmail || !userName) {
      onAuthRequired?.();
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/likes/${itemType}/${itemId}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userEmail, userName }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore nella gestione del like' }));
        throw new Error(errorData.error || 'Errore nella gestione del like');
      }

      const result = await response.json();
      const data = result.success ? result.data : result; // Handle both standardized and legacy response formats

      // Update stats based on action
      setStats(prev => ({
        ...prev,
        hasUserLiked: data.action === 'added',
        likesCount: data.action === 'added' 
          ? prev.likesCount + 1 
          : Math.max(0, prev.likesCount - 1)
      }));

      toast({
        title: data.action === 'added' ? 'Like aggiunto' : 'Like rimosso',
        description: data.message || '',
      });
    } catch (error) {
      console.error('Errore like:', error);
      toast({
        title: 'Errore',
        description: error instanceof Error ? error.message : 'Errore nella gestione del like',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle comment submission
  const handleSubmitComment = async () => {
    if (!isAuthenticated || !userEmail || !userName) {
      onAuthRequired?.();
      return;
    }

    if (!newComment.trim()) {
      toast({
        title: 'Errore',
        description: 'Il commento non può essere vuoto',
        variant: 'destructive',
      });
      return;
    }

    if (newComment.length > 500) {
      toast({
        title: 'Errore',
        description: 'Il commento non può superare i 500 caratteri',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSubmittingComment(true);
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/comments/${itemType}/${itemId}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userEmail, 
          userName, 
          content: newComment.trim() 
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore nell\'aggiunta del commento' }));
        throw new Error(errorData.error || 'Errore nell\'aggiunta del commento');
      }

      const result = await response.json();
      const commentData = result.success ? result.data : result;

      // Add comment to local state
      setComments(prev => [commentData, ...prev]);

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
        description: error instanceof Error ? error.message : 'Errore nell\'aggiunta del commento',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handle comment deletion (admin only)
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(createUrl(`/api/galleries/${galleryId}/comments/${commentId}`), {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Errore nell\'eliminazione del commento' }));
        throw new Error(errorData.error || 'Errore nell\'eliminazione del commento');
      }

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
  const formatDate = (timestamp: any): string => {
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
      {!isAuthenticated && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-blue-800 text-sm">
              <User className="h-4 w-4" />
              <span>Accedi per mettere like e commentare</span>
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
    </div>
  );
}
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
import { Comment, InteractionStats } from '@shared/schema';
import CommentModal from './CommentModal';

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
  userEmail,
  userName,
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
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState(false);

  const { toast } = useToast();

  // Fetch interaction stats
  const fetchStats = async () => {
    try {
      const url = `/api/galleries/${galleryId}/stats/${itemType}/${itemId}${userEmail ? `?userEmail=${encodeURIComponent(userEmail)}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) throw new Error('Errore nel caricamento statistiche');
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Errore nel caricamento statistiche:', error);
    }
  };

  // Fetch comments
  const fetchComments = async () => {
    try {
      const response = await fetch(`/api/galleries/${galleryId}/comments/${itemType}/${itemId}`);
      
      if (!response.ok) throw new Error('Errore nel caricamento commenti');
      
      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error('Errore nel caricamento commenti:', error);
    }
  };

  // Handle like/unlike
  const handleLike = async () => {
    if (!userEmail || !userName) {
      if (onAuthRequired) {
        onAuthRequired();
      } else {
        toast({
          title: "Accesso richiesto",
          description: "Devi essere autenticato per mettere like",
          variant: "destructive"
        });
      }
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/galleries/${galleryId}/likes/${itemType}/${itemId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userEmail, userName })
      });

      if (!response.ok) throw new Error('Errore nella gestione del like');

      const result = await response.json();
      
      // Update stats optimistically
      setStats(prev => ({
        ...prev,
        likesCount: result.action === 'added' ? prev.likesCount + 1 : prev.likesCount - 1,
        hasUserLiked: result.action === 'added'
      }));

      toast({
        title: result.action === 'added' ? "Like aggiunto!" : "Like rimosso",
        description: result.message,
      });
    } catch (error) {
      console.error('Errore like:', error);
      toast({
        title: "Errore",
        description: "Errore nella gestione del like",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle comment submission
  const handleSubmitComment = async () => {
    if (!userEmail || !userName) {
      if (onAuthRequired) {
        onAuthRequired();
      } else {
        toast({
          title: "Accesso richiesto",
          description: "Devi essere autenticato per commentare",
          variant: "destructive"
        });
      }
      return;
    }

    if (!newComment.trim()) {
      toast({
        title: "Errore",
        description: "Il commento non può essere vuoto",
        variant: "destructive"
      });
      return;
    }

    setIsSubmittingComment(true);
    try {
      const response = await fetch(`/api/galleries/${galleryId}/comments/${itemType}/${itemId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userEmail,
          userName,
          content: newComment.trim()
        })
      });

      if (!response.ok) throw new Error('Errore nell\'aggiunta del commento');

      const newCommentData = await response.json();
      
      // Add comment to list
      setComments(prev => [newCommentData, ...prev]);
      setNewComment('');
      
      // Update stats
      setStats(prev => ({
        ...prev,
        commentsCount: prev.commentsCount + 1
      }));

      toast({
        title: "Commento aggiunto!",
        description: "Il tuo commento è stato pubblicato",
      });
    } catch (error) {
      console.error('Errore commento:', error);
      toast({
        title: "Errore",
        description: "Errore nell'aggiunta del commento",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Handle comment deletion (admin only)
  const handleDeleteComment = async (commentId: string) => {
    if (!isAdmin) return;

    try {
      const response = await fetch(`/api/galleries/${galleryId}/comments/${commentId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Errore nell\'eliminazione del commento');

      // Remove comment from list
      setComments(prev => prev.filter(comment => comment.id !== commentId));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        commentsCount: prev.commentsCount - 1
      }));

      toast({
        title: "Commento eliminato",
        description: "Il commento è stato rimosso",
      });
    } catch (error) {
      console.error('Errore eliminazione commento:', error);
      toast({
        title: "Errore",
        description: "Errore nell'eliminazione del commento",
        variant: "destructive"
      });
    }
  };

  // Format date for comments
  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    try {
      let date: Date;
      
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp.seconds && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
      } else {
        date = new Date(timestamp);
      }
      
      if (isNaN(date.getTime())) return 'Data non disponibile';
      
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

  // Debug logging for auth state
  useEffect(() => {
    console.log('InteractionPanel auth state:', {
      userEmail,
      userName,
      hasEmail: !!userEmail,
      hasName: !!userName
    });
  }, [userEmail, userName]);

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
          disabled={isLoading}
          variant="ghost"
          size="sm"
          className={`h-8 px-3 ${stats.hasUserLiked 
            ? 'text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100' 
            : 'text-gray-600 hover:text-red-600 hover:bg-red-50'
          }`}
        >
          <Heart className={`h-4 w-4 mr-1 ${stats.hasUserLiked ? 'fill-current' : ''}`} />
          <span className="text-sm font-medium">{stats.likesCount}</span>
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
          <span className="text-sm font-medium">{stats.commentsCount}</span>
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
    </div>
  );
}
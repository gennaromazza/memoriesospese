import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Send, 
  Loader2,
  MessageCircle,
  User,
  Clock,
  Trash2
} from 'lucide-react';
import { Comment } from '@shared/schema';

interface CommentModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  comments: Comment[];
  newComment: string;
  onNewCommentChange: (value: string) => void;
  onSubmitComment: () => void;
  onDeleteComment: (commentId: string) => void;
  isSubmitting: boolean;
  isAdmin: boolean;
  userEmail?: string;
  userName?: string;
}

export default function CommentModal({
  isOpen,
  onOpenChange,
  comments,
  newComment,
  onNewCommentChange,
  onSubmitComment,
  onDeleteComment,
  isSubmitting,
  isAdmin,
  userEmail,
  userName
}: CommentModalProps) {
  const { toast } = useToast();

  const formatDateTime = (timestamp: any): string => {
    try {
      let date: Date;
      
      // Handle Firebase Timestamp
      if (timestamp && timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      }
      // Handle Firebase Timestamp object with seconds
      else if (timestamp && timestamp.seconds && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
      }
      // Handle standard date string or Date object
      else if (timestamp) {
        date = new Date(timestamp);
      }
      // Handle null/undefined
      else {
        return new Date().toLocaleDateString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      if (isNaN(date.getTime())) {
        return new Date().toLocaleDateString('it-IT', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      
      return date.toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error, timestamp);
      return new Date().toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newComment.trim()) {
      toast({
        title: "Errore",
        description: "Il commento non può essere vuoto",
        variant: "destructive"
      });
      return;
    }

    if (newComment.trim().length > 500) {
      toast({
        title: "Errore",
        description: "Il commento non può superare i 500 caratteri",
        variant: "destructive"
      });
      return;
    }

    onSubmitComment();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col" aria-describedby="comment-modal-description">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Commenti
          </DialogTitle>
          <DialogDescription id="comment-modal-description">
            Lascia un commento o leggi cosa hanno scritto gli altri ospiti
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Add comment form */}
          {userEmail && userName && (
            <form onSubmit={handleSubmit} className="space-y-3 border-b pb-4">
              <Label htmlFor="comment-input" className="text-sm font-medium">
                Scrivi un commento
              </Label>
              <Textarea
                id="comment-input"
                placeholder="Condividi i tuoi pensieri..."
                value={newComment}
                onChange={(e) => onNewCommentChange(e.target.value)}
                className="min-h-[80px] resize-none"
                maxLength={500}
                disabled={isSubmitting}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  {newComment.length}/500 caratteri
                </span>
                <Button
                  type="submit"
                  disabled={isSubmitting || !newComment.trim()}
                  size="sm"
                  className="bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Invio...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="h-3 w-3" />
                      Commenta
                    </div>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto">
            <div className="space-y-3 pr-2">
              {comments.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-sm">
                    Nessun commento ancora. Sii il primo a commentare!
                  </p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-gray-50 p-4 rounded-lg">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-sage-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-sage-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{comment.userName}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(comment.createdAt)}
                          </p>
                        </div>
                      </div>
                      {isAdmin && (
                        <Button
                          onClick={() => onDeleteComment(comment.id)}
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">{comment.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
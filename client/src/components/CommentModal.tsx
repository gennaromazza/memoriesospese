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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { 
  Send, 
  Loader2,
  MessageCircle,
  User,
  Clock,
  Trash2,
  Smile
} from 'lucide-react';
import { Comment } from '@shared/schema';
import UserAvatar from './UserAvatar';
import { Timestamp } from 'firebase/firestore';

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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Lista di emoji comuni per matrimoni e eventi
  const emojiCategories = {
    'Emozioni': ['😍', '🥰', '😘', '💕', '💖', '❤️', '💝', '😊', '😄', '🤩', '😭', '🥺', '😳'],
    'Matrimonio': ['💒', '👰', '🤵', '💍', '💐', '🌹', '🥂', '🍾', '🎂', '⛪', '🎊', '🎉'],
    'Gesti': ['👏', '🙌', '👍', '✌️', '🤞', '💪', '🤝', '👌', '👸', '🤴', '💃', '🕺'],
    'Altro': ['✨', '🌟', '⭐', '💫', '🎆', '🎇', '🔥', '💯', '🎈', '🎁', '🌈', '☀️', '🌸']
  };

  const handleEmojiSelect = (emoji: string) => {
    onNewCommentChange(newComment + emoji);
    setShowEmojiPicker(false);
  };

  const formatDateTime = (timestamp: Timestamp | Date | string | number | null | undefined): string => {
    try {
      let date: Date;

      // Handle Firebase Timestamp
      if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as any).toDate === 'function') {
        date = (timestamp as any).toDate();
      }
      // Handle Firebase Timestamp object with seconds
      else if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp && typeof (timestamp as any).seconds === 'number') {
        date = new Date((timestamp as any).seconds * 1000);
      }
      // Handle standard date string or Date object
      else if (timestamp) {
        date = new Date(timestamp as string | number | Date);
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

  const handleSubmit = async (e: React.FormEvent) => {
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

    if (!userEmail || !userName) {
      toast({
        title: "Errore",
        description: "Devi essere autenticato per commentare",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log('🔍 Invio commento con dati:', { userEmail, userName, text: newComment.trim() });
      await onSubmitComment();
    } catch (error) {
      console.error('❌ Errore invio commento:', error);
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Errore nell'invio del commento",
        variant: "destructive"
      });
    }
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
            Visualizza e aggiungi commenti per questa foto
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Add comment form */}
          {userEmail && userName && (
            <form onSubmit={handleSubmit} className="space-y-3 border-b pb-4">
              <Label htmlFor="comment-input" className="text-sm font-medium">
                Scrivi un commento
              </Label>
              <div className="relative">
                <Textarea
                  id="comment-input"
                  placeholder="Condividi i tuoi pensieri..."
                  value={newComment}
                  onChange={(e) => onNewCommentChange(e.target.value)}
                  className="min-h-[80px] resize-none pr-12"
                  maxLength={500}
                  disabled={isSubmitting}
                />
                {/* Emoji picker button */}
                <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-8 w-8 p-0 hover:bg-gray-100"
                      disabled={isSubmitting}
                    >
                      <Smile className="h-4 w-4 text-gray-500" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-4" align="end">
                    <div className="space-y-3">
                      {Object.entries(emojiCategories).map(([category, emojis]) => (
                        <div key={category}>
                          <h4 className="text-xs font-medium text-gray-600 mb-2">{category}</h4>
                          <div className="grid grid-cols-8 gap-1">
                            {emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleEmojiSelect(emoji)}
                                className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded transition-colors"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
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
                  <div key={comment.id} className="bg-white/80 backdrop-blur-sm border border-gray-100 p-4 rounded-lg shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          userEmail={comment.userEmail}
                          userName={comment.userName}
                          userProfileImageUrl={comment.userProfileImageUrl}
                          size="sm"
                        />
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
                    <p className="text-sm text-gray-700 leading-relaxed">{comment.text}</p>
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
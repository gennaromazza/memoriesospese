import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const emojiCategories = {
    'Emozioni': ['😍', '🥰', '😘', '💕', '💖', '❤️', '💝', '😊', '😄', '🤩', '😭', '🥺'],
    'Matrimonio': ['💒', '👰', '🤵', '💍', '💐', '🌹', '🥂', '🍾', '🎂', '⛪', '🎊', '🎉'],
    'Gesti': ['👏', '🙌', '👍', '✌️', '🤞', '💪', '🤝', '👌', '👸', '🤴', '💃', '🕺'],
    'Altro': ['✨', '🌟', '⭐', '💫', '🎆', '🎇', '🔥', '💯', '🎈', '🎁', '🌈', '🌸']
  };

  const handleEmojiSelect = (emoji: string) => {
    onNewCommentChange(newComment + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, comments.length]);

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
        month: '2-digit',
        year: 'numeric'
      });
    } catch (error) {
      return 'Ora';
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
      await onSubmitComment();
    } catch (error) {
      console.error('Errore invio commento:', error);
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Errore nell'invio del commento",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] max-h-[85vh] sm:max-h-[80vh] flex flex-col p-0 gap-0 rounded-t-2xl sm:rounded-2xl" aria-describedby="comment-modal-description">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-3 sm:hidden" />
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-5 w-5 text-sage-600" />
            Commenti
            {comments.length > 0 && (
              <span className="text-xs font-normal text-gray-400 ml-1">({comments.length})</span>
            )}
          </DialogTitle>
          <DialogDescription id="comment-modal-description" className="sr-only">
            Visualizza e aggiungi commenti per questa foto
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-4 py-3"
        >
          {comments.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="h-7 w-7 text-gray-300" />
              </div>
              <p className="text-gray-400 text-sm">
                Sii il primo a commentare!
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <div className="flex-shrink-0 pt-0.5">
                    <UserAvatar
                      userEmail={comment.userEmail}
                      userName={comment.userName}
                      userProfileImageUrl={comment.userProfileImageUrl}
                      size="sm"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="bg-gray-50 rounded-2xl rounded-tl-md px-3.5 py-2.5">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <p className="font-semibold text-gray-900 text-[13px] truncate">{comment.userName}</p>
                        <span className="text-[11px] text-gray-400 flex-shrink-0">
                          {formatDateTime(comment.createdAt)}
                        </span>
                      </div>
                      <p className="text-[14px] text-gray-700 leading-relaxed break-words">{comment.text || comment.content || ''}</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => onDeleteComment(comment.id)}
                        className="flex items-center gap-1 mt-1 ml-2 text-[11px] text-gray-400 hover:text-red-500 active:text-red-600 touch-manipulation transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        Elimina
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {userEmail && userName && (
          <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-gray-100 px-3 py-3 bg-white safe-area-bottom">
            <div className="flex items-end gap-2">
              <div className="flex-1 relative">
                <Textarea
                  ref={textareaRef}
                  placeholder="Scrivi un commento..."
                  value={newComment}
                  onChange={(e) => onNewCommentChange(e.target.value)}
                  className="min-h-[44px] max-h-[120px] resize-none rounded-2xl border-gray-200 bg-gray-50 focus:bg-white pr-10 text-[15px] py-2.5 px-4 leading-snug"
                  maxLength={500}
                  disabled={isSubmitting}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />
                <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="absolute right-2.5 bottom-2 h-8 w-8 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200 touch-manipulation transition-colors"
                      disabled={isSubmitting}
                    >
                      <Smile className="h-5 w-5 text-gray-400" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[280px] sm:w-80 p-3" align="end" side="top" sideOffset={8}>
                    <div className="space-y-2.5 max-h-[240px] overflow-y-auto overscroll-contain">
                      {Object.entries(emojiCategories).map(([category, emojis]) => (
                        <div key={category}>
                          <h4 className="text-[11px] font-medium text-gray-500 mb-1.5 uppercase tracking-wider">{category}</h4>
                          <div className="grid grid-cols-6 sm:grid-cols-8 gap-0.5">
                            {emojis.map((emoji) => (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => handleEmojiSelect(emoji)}
                                className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-xl sm:text-lg hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors touch-manipulation"
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
              <Button
                type="submit"
                disabled={isSubmitting || !newComment.trim()}
                size="sm"
                className="h-10 w-10 rounded-full p-0 bg-sage-600 hover:bg-sage-700 active:bg-sage-800 flex-shrink-0 touch-manipulation transition-colors"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
            {newComment.length > 400 && (
              <p className="text-[11px] text-gray-400 mt-1.5 text-right">
                {newComment.length}/500
              </p>
            )}
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
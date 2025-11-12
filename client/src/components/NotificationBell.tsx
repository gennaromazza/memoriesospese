
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, MessageCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getAllBookings } from '@/lib/bookings';
import { useConsultations } from '@/lib/consultations';
import { CommentService } from '@/lib/comments';
import { GalleryService } from '@/lib/galleries';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Booking } from '@shared/booking-types';
import type { Consultation } from '@shared/consultation-types';
import type { Comment } from '@/lib/comments';

interface PhotoSelection {
  id: string;
  galleryId: string;
  galleryName?: string;
  clientName?: string;
  selectedPhotoCount: number;
  requiredPhotoCount?: number;
  selectedAt: any;
}

interface NotificationBellProps {
  onNavigateToBooking?: (bookingId: string) => void;
  onNavigateToConsultation?: (consultationId: string) => void;
  onNavigateToGallery?: (galleryCode: string) => void;
}

export default function NotificationBell({ 
  onNavigateToBooking, 
  onNavigateToConsultation 
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  // Query bookings non visualizzati
  const { data: allBookings = [] } = useQuery<Booking[]>({
    queryKey: ['bookings'],
    queryFn: getAllBookings,
    refetchInterval: 30000, // Refresh ogni 30 secondi
  });

  // Query consulenze non visualizzate
  const { data: allConsultations = [] } = useConsultations(true);

  // Query commenti recenti (ultimi 24 ore)
  const { data: recentComments = [] } = useQuery<Comment[]>({
    queryKey: ['admin-recent-comments'],
    queryFn: async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const commentsQuery = query(
          collection(db, 'comments'),
          where('createdAt', '>=', Timestamp.fromDate(yesterday)),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
        
        const snapshot = await getDocs(commentsQuery);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Comment));
      } catch (error) {
        console.error('Errore caricamento commenti recenti:', error);
        return [];
      }
    },
    refetchInterval: 30000,
  });

  // Query selezioni foto completate recenti (ultimi 7 giorni)
  const { data: recentSelections = [] } = useQuery<PhotoSelection[]>({
    queryKey: ['admin-recent-selections'],
    queryFn: async () => {
      try {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        
        const galleriesQuery = query(
          collection(db, 'galleries'),
          where('selectionStatus', '==', 'completed'),
          where('selectionCompletedAt', '>=', Timestamp.fromDate(weekAgo)),
          orderBy('selectionCompletedAt', 'desc'),
          limit(10)
        );
        
        const snapshot = await getDocs(galleriesQuery);
        return snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            galleryId: doc.id,
            galleryName: data.name,
            clientName: data.clientName || 'Cliente',
            selectedPhotoCount: data.selectedPhotoIds?.length || 0,
            requiredPhotoCount: data.requiredPhotoCount,
            selectedAt: data.selectionCompletedAt
          } as PhotoSelection;
        });
      } catch (error) {
        console.error('Errore caricamento selezioni recenti:', error);
        return [];
      }
    },
    refetchInterval: 30000,
  });

  // Filtra notifiche non visualizzate
  const unviewedBookings = allBookings.filter(b => !b.dataVisualizzazione && b.stato === 'in_attesa');
  const unviewedConsultations = (allConsultations || []).filter(c => !c.dataVisualizzazione && c.stato === 'in_attesa');
  
  // Commenti e selezioni sono sempre "nuovi" se recenti (non hanno flag visualizzazione)
  const unviewedComments = recentComments.length;
  const unviewedSelections = recentSelections.length;

  const totalUnviewed = unviewedBookings.length + unviewedConsultations.length + unviewedComments + unviewedSelections;

  // Audio notification per nuove notifiche (opzionale)
  useEffect(() => {
    if (totalUnviewed > 0) {
      // Suono campanello leggero (solo se l'utente ha interagito con la pagina)
      const playNotification = () => {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZizkIGGe77eeeTRALUKfj8LZjHAU4kdfyzHksBSR3yPDdkEAKE1627O2oVRQLRp/g8r5sIQYrgs/y2Ys5CBhnvO3onk0QC1Cn4/C2YxwGOJHX8sx5LAUkeMjw3ZBADC93v+ztqFUUC0af4PK+bCEFLIHP8tmLOQgYZ7zt6J5NEAtQp+PwtmMcBjiR1/LMeSwFJHjI8N2QQA==');
        audio.volume = 0.3;
        audio.play().catch(() => {
          // Ignora errori se il browser blocca l'autoplay
        });
      };

      // Solo se la finestra è in focus
      if (document.hasFocus()) {
        playNotification();
      }
    }
  }, [totalUnviewed]);

  const handleBookingClick = (bookingId: string) => {
    setOpen(false);
    onNavigateToBooking?.(bookingId);
  };

  const handleConsultationClick = (consultationId: string) => {
    setOpen(false);
    onNavigateToConsultation?.(consultationId);
  };

  const handleGalleryClick = (galleryCode: string) => {
    setOpen(false);
    onNavigateToGallery?.(galleryCode);
  };

  const handleCommentClick = (comment: Comment) => {
    setOpen(false);
    // Naviga alla galleria del commento
    if (comment.galleryId) {
      // Ottieni il codice galleria e naviga
      GalleryService.getGalleryById(comment.galleryId).then(gallery => {
        if (gallery?.code) {
          onNavigateToGallery?.(gallery.code);
        }
      }).catch(console.error);
    }
  };

  const handleSelectionClick = (selection: PhotoSelection) => {
    setOpen(false);
    // Naviga alla pagina di gestione galleria
    if (selection.galleryId) {
      GalleryService.getGalleryById(selection.galleryId).then(gallery => {
        if (gallery?.code) {
          onNavigateToGallery?.(gallery.code);
        }
      }).catch(console.error);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="notification-bell"
        >
          <Bell className="h-5 w-5" />
          {totalUnviewed > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500 hover:bg-red-600 animate-pulse"
              data-testid="notification-badge"
            >
              {totalUnviewed > 9 ? '9+' : totalUnviewed}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-sm">Notifiche</h3>
          {totalUnviewed > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalUnviewed} {totalUnviewed === 1 ? 'nuova' : 'nuove'}
            </Badge>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {totalUnviewed === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p>Nessuna nuova notifica</p>
            </div>
          ) : (
            <div className="divide-y">
              {/* Prenotazioni Booking */}
              {unviewedBookings.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground">
                      PRENOTAZIONI BOOKING ({unviewedBookings.length})
                    </p>
                  </div>
                  {unviewedBookings.map((booking) => (
                    <button
                      key={booking.id}
                      onClick={() => handleBookingClick(booking.id)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      data-testid={`notification-booking-${booking.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {booking.cliente.nome} {booking.cliente.cognome}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(
                              booking.dataShootingInizio?.toDate?.() || new Date(),
                              "dd MMM yyyy 'alle' HH:mm",
                              { locale: it }
                            )}
                          </p>
                          {booking.prodottoNome && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              📦 {booking.prodottoNome}
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Consulenze */}
              {unviewedConsultations.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground">
                      CONSULENZE ({unviewedConsultations.length})
                    </p>
                  </div>
                  {unviewedConsultations.map((consultation) => (
                    <button
                      key={consultation.id}
                      onClick={() => handleConsultationClick(consultation.id)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      data-testid={`notification-consultation-${consultation.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {consultation.cliente.nome} {consultation.cliente.cognome}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {format(
                              consultation.dataConsulenza?.toDate?.() || new Date(),
                              "dd MMM yyyy 'alle' HH:mm",
                              { locale: it }
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            💼 {consultation.templateNome}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Commenti Recenti */}
              {recentComments.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground">
                      COMMENTI RECENTI ({recentComments.length})
                    </p>
                  </div>
                  {recentComments.map((comment) => (
                    <button
                      key={comment.id}
                      onClick={() => handleCommentClick(comment)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      data-testid={`notification-comment-${comment.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <MessageCircle className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {comment.userName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {comment.content || comment.text}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {comment.createdAt?.toDate ? format(
                              comment.createdAt.toDate(),
                              "dd MMM yyyy 'alle' HH:mm",
                              { locale: it }
                            ) : 'Data sconosciuta'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Selezioni Foto Completate */}
              {recentSelections.length > 0 && (
                <div>
                  <div className="px-4 py-2 bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground">
                      SELEZIONI FOTO ({recentSelections.length})
                    </p>
                  </div>
                  {recentSelections.map((selection) => (
                    <button
                      key={selection.id}
                      onClick={() => handleSelectionClick(selection)}
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      data-testid={`notification-selection-${selection.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-1">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">
                            {selection.galleryName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {selection.clientName} ha completato la selezione
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            📸 {selection.selectedPhotoCount}{selection.requiredPhotoCount ? ` / ${selection.requiredPhotoCount}` : ''} foto selezionate
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {selection.selectedAt?.toDate ? format(
                              selection.selectedAt.toDate(),
                              "dd MMM yyyy 'alle' HH:mm",
                              { locale: it }
                            ) : 'Data sconosciuta'}
                          </p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </ScrollArea>

        {totalUnviewed > 0 && (
          <>
            <Separator />
            <div className="p-2 text-center">
              <p className="text-xs text-muted-foreground">
                Clicca su una notifica per visualizzarla
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

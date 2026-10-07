import React, { useMemo, useCallback } from 'react';
import { Bell, Camera, MessageCircle, MessageSquare, CheckSquare, FileText, ClipboardList, BookOpen, ShoppingBag, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  isAtNotificationDestination,
  resolveNotificationDestination,
} from '@/lib/notification-destination';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

export const NotificationBell = React.memo(function NotificationBell({ enabled = true }: { enabled?: boolean }) {
  const { data: notifications = [], isLoading } = useNotifications(enabled);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  
  // 🚀 Memoizza il conteggio non letti
  const unreadCount = useMemo(() => 
    notifications.filter(n => n && !n.isRead).length,
    [notifications]
  );
  
  // 🚀 Memoizza la funzione getIcon per evitare ricreazioni
  const getIcon = useCallback((type: string) => {
    switch (type) {
      case 'booking': return <Camera className="h-4 w-4" />;
      case 'consultation': return <MessageCircle className="h-4 w-4" />;
      case 'comment': return <MessageSquare className="h-4 w-4" />;
      case 'selection': return <CheckSquare className="h-4 w-4" />;
      case 'quick_quote': return <FileText className="h-4 w-4" />;
      case 'info_form': return <ClipboardList className="h-4 w-4" />;
      case 'photobook': return <BookOpen className="h-4 w-4" />;
      case 'print_shop_order': return <ShoppingBag className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  }, []);
  
  const [open, setOpen] = React.useState(false);
  
  const handleNotificationClick = useCallback((notification: Notification) => {
    const destination = resolveNotificationDestination(
      notification.deepLink,
      window.location.href,
    );
    if (!destination) {
      console.error('Destinazione notifica non valida:', notification.deepLink);
      return;
    }

    // Chiudi popover immediatamente
    setOpen(false);
    
    // Navigazione client-side. Il confronto del fallback include anche i
    // parametri: molte notifiche restano sulla stessa pagina admin ma cambiano
    // scheda e record selezionato.
    try {
      navigate(destination);
      window.dispatchEvent(new CustomEvent('admin-notification-navigate', {
        detail: { destination },
      }));
      setTimeout(() => {
        if (!isAtNotificationDestination(window.location.href, destination)) {
          // Recupera la navigazione se il router non aggiorna la webview.
          window.location.assign(destination);
        }
      }, 400);
    } catch (error) {
      console.error('Navigazione fallita, uso fallback:', error);
      window.location.assign(destination);
    }
    
    // Invalida query notifiche per refresh
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    }, 500);
  }, [navigate, queryClient]);
  
  const handleDismissNotification = useCallback(async (notification: Notification) => {
    try {
      if (notification.adminNotificationId || notification.type === 'quick_quote') {
        const firestoreDocId = notification.adminNotificationId
          || notification.id.replace('quick-quote-', '');
        const { getAuth } = await import('firebase/auth');
        const auth = getAuth();
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch(`/api/jobs/notifications/${firestoreDocId}/dismiss`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
          });
        }
      } else if (notification.type === 'info_form') {
        const firestoreDocId = notification.id.replace('info-form-', '');
        const { markInfoFormNotificationRead } = await import('@/lib/infoForms');
        await markInfoFormNotificationRead(firestoreDocId);
      } else {
        const { db } = await import('@/lib/firebase');
        const { doc, updateDoc } = await import('firebase/firestore');
        let collectionName = '';
        if (notification.type === 'booking') collectionName = 'bookings';
        else if (notification.type === 'consultation') collectionName = 'consultations';

        if (collectionName) {
          await updateDoc(doc(db, collectionName, notification.resourceId), {
            dataVisualizzazione: new Date()
          });
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    } catch (error) {
      console.error('Errore dismissione notifica:', error);
    }
  }, [queryClient]);
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="button-notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs animate-bounce shadow-lg ring-2 ring-red-300 ring-offset-1"
              data-testid="badge-unread-count"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0" align="end">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Notifiche</h3>
        </div>
        
        <div
          role="region"
          aria-label="Elenco notifiche"
          tabIndex={0}
          className="max-h-[70vh] sm:max-h-96 overflow-y-auto overscroll-contain"
        >
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Caricamento...
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Nessuna notifica
            </div>
          ) : (
            <div className="divide-y">
              {notifications.filter(n => n !== null && n !== undefined).map(notification => (
                <div
                  key={notification.id}
                  className={`relative group ${
                    !notification.isRead ? 'bg-sage/5' : ''
                  }`}
                >
                  <button
                    onClick={() => handleNotificationClick(notification)}
                    className="w-full p-3 sm:p-4 text-left hover:bg-accent transition-colors"
                    data-testid={`notification-${notification.type}-${notification.resourceId}`}
                  >
                    <div className="flex items-start gap-2 sm:gap-3 pr-10">
                      <div className={`p-1.5 sm:p-2 rounded-full flex-shrink-0 ${
                        !notification.isRead ? 'bg-sage/20' : 'bg-muted'
                      }`}>
                        {getIcon(notification.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {notification.title}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                          {notification.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {notification.createdAt?.toDate && 
                            formatDistanceToNow(notification.createdAt.toDate(), {
                              addSuffix: true,
                              locale: it
                            })
                          }
                        </p>
                      </div>
                      
                      {!notification.isRead && (
                        <div className="h-2 w-2 rounded-full bg-[#A8B5A0] flex-shrink-0 mt-1" />
                      )}
                    </div>
                  </button>
                  
                  {/* Pulsante chiudi notifica - sempre visibile su mobile */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 sm:h-6 sm:w-6 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-accent"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDismissNotification(notification);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
});

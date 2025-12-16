import React, { useMemo, useCallback } from 'react';
import { Bell, Camera, MessageCircle, MessageSquare, CheckSquare, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useNotifications } from '@/hooks/useNotifications';
import { useQueryClient } from '@tanstack/react-query';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';

export const NotificationBell = React.memo(function NotificationBell() {
  const { data: notifications = [], isLoading } = useNotifications();
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
      default: return <Bell className="h-4 w-4" />;
    }
  }, []);
  
  const [open, setOpen] = React.useState(false);
  
  const handleNotificationClick = useCallback((deepLink: string) => {
    // Chiudi popover immediatamente
    setOpen(false);
    
    // Navigazione con fallback multiplo per browser Replit
    try {
      // 1. Prova navigazione client-side
      navigate(deepLink);
      
      // 2. Fallback: forza reload se client-side non funziona (Replit webview)
      setTimeout(() => {
        const currentPath = window.location.pathname + window.location.search;
        if (!currentPath.includes(deepLink.split('?')[0])) {
          // Se dopo 300ms non siamo sulla pagina corretta, forza reload
          window.location.href = deepLink;
        }
      }, 300);
    } catch (error) {
      console.error('Navigazione fallita, uso fallback:', error);
      window.location.href = deepLink;
    }
    
    // Invalida query notifiche per refresh
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    }, 500);
  }, [navigate, queryClient]);
  
  const handleDismissNotification = useCallback(async (resourceId: string) => {
    try {
      // Segna come letta in Firestore
      const { db } = await import('@/lib/firebase');
      const { doc, updateDoc } = await import('firebase/firestore');
      
      // Trova la notifica per tipo
      const notification = notifications.find(n => n && n.resourceId === resourceId);
      if (!notification) return;
      
      let collectionName = '';
      if (notification.type === 'booking') collectionName = 'bookings';
      else if (notification.type === 'consultation') collectionName = 'consultations';
      
      if (collectionName) {
        await updateDoc(doc(db, collectionName, resourceId), {
          dataVisualizzazione: new Date()
        });
      }
      
      // Refresh notifiche
      queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    } catch (error) {
      console.error('Errore dismissione notifica:', error);
    }
  }, [notifications, queryClient]);
  
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
        
        <ScrollArea className="max-h-[70vh] sm:max-h-96">
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
                    onClick={() => handleNotificationClick(notification.deepLink)}
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
                      handleDismissNotification(notification.resourceId);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});

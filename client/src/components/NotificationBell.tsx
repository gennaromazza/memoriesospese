import React, { useMemo, useCallback } from 'react';
import { Bell, Camera, MessageCircle, MessageSquare, CheckSquare } from 'lucide-react';
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
    notifications.filter(n => !n.isRead).length,
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
              className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
              data-testid="badge-unread-count"
            >
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-96 p-0" align="end">
        <div className="border-b px-4 py-3">
          <h3 className="font-semibold">Notifiche</h3>
        </div>
        
        <ScrollArea className="max-h-96">
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
              {notifications.map(notification => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification.deepLink)}
                  className={`w-full p-4 text-left hover:bg-accent transition-colors ${
                    !notification.isRead ? 'bg-sage/5' : ''
                  }`}
                  data-testid={`notification-${notification.type}-${notification.resourceId}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-full ${
                      !notification.isRead ? 'bg-sage/20' : 'bg-muted'
                    }`}>
                      {getIcon(notification.type)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">
                        {notification.title}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
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
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
});

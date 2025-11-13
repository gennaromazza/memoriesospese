import { Bell, Camera, MessageCircle, MessageSquare, CheckSquare } from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { createUrl } from '@/lib/basePath';

export function NotificationBell() {
  const { data: notifications = [], isLoading } = useNotifications();
  
  const unreadCount = notifications.filter(n => !n.isRead).length;
  
  const getIcon = (type: string) => {
    switch (type) {
      case 'booking': return <Camera className="h-4 w-4" />;
      case 'consultation': return <MessageCircle className="h-4 w-4" />;
      case 'comment': return <MessageSquare className="h-4 w-4" />;
      case 'selection': return <CheckSquare className="h-4 w-4" />;
      default: return <Bell className="h-4 w-4" />;
    }
  };
  
  const handleNotificationClick = (deepLink: string) => {
    window.location.href = createUrl(deepLink);
  };
  
  return (
    <Popover>
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
}

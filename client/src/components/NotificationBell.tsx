
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
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
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { Booking } from '@shared/booking-types';
import type { Consultation } from '@shared/consultation-types';

interface NotificationBellProps {
  onNavigateToBooking?: (bookingId: string) => void;
  onNavigateToConsultation?: (consultationId: string) => void;
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

  // Filtra notifiche non visualizzate
  const unviewedBookings = allBookings.filter(b => !b.dataVisualizzazione && b.stato === 'in_attesa');
  const unviewedConsultations = (allConsultations || []).filter(c => !c.dataVisualizzazione && c.stato === 'in_attesa');

  const totalUnviewed = unviewedBookings.length + unviewedConsultations.length;

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

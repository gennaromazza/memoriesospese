import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Cliente } from '@shared/clienti-types';
import type { Booking, Order } from '@shared/booking-types';
import type { Job } from '@shared/jobs-types';
import type { Gallery } from '@/lib/galleries';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { Calendar, ShoppingCart, Image as ImageIcon, ExternalLink, Lock, User, Briefcase } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';

type PasswordRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  requestDate: any;
  galleryId?: string;
};

type UserRecord = {
  id: string;
  email: string;
  displayName?: string;
  createdAt: any;
};

type TimelineEvent = {
  id: string;
  type: 'booking' | 'order' | 'gallery' | 'passwordRequest' | 'user' | 'job';
  date: Date;
  title: string;
  description: string;
  status?: string;
  link?: string;
  data: Booking | Order | Gallery | PasswordRequest | UserRecord | Job;
};

interface ClienteStoricoProps {
  cliente: Cliente;
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  
  // Firestore Timestamp
  if (value.toDate && typeof value.toDate === 'function') {
    return value.toDate();
  }
  
  // ISO string or epoch number
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }
  
  // Already a Date
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  
  return null;
}

async function loadBooking(id: string): Promise<Booking | null> {
  const docRef = doc(db, 'bookings', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Booking;
}

async function loadOrder(id: string): Promise<Order | null> {
  const docRef = doc(db, 'orders', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Order;
}

async function loadGallery(id: string): Promise<Gallery | null> {
  const docRef = doc(db, 'galleries', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Gallery;
}

async function loadPasswordRequest(id: string): Promise<PasswordRequest | null> {
  const docRef = doc(db, 'passwordRequests', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as PasswordRequest;
}

async function loadUser(id: string): Promise<UserRecord | null> {
  const docRef = doc(db, 'users', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as UserRecord;
}

async function loadJob(id: string): Promise<Job | null> {
  const docRef = doc(db, 'jobs', id);
  const docSnap = await getDoc(docRef);
  if (!docSnap.exists()) return null;
  return { id: docSnap.id, ...docSnap.data() } as Job;
}

export default function ClienteStorico({ cliente }: ClienteStoricoProps) {
  const { data: events = [], isLoading, error } = useQuery<TimelineEvent[]>({
    queryKey: ['cliente-storico', cliente.id],
    queryFn: async () => {
      const allEvents: TimelineEvent[] = [];

      for (const bookingId of cliente.sourceRefs.bookingIds || []) {
        const booking = await loadBooking(bookingId);
        if (booking) {
          const date = parseDate(booking.dataShootingInizio);
          if (date) {
            allEvents.push({
              id: bookingId,
              type: 'booking',
              date,
              title: 'Prenotazione',
              description: booking.prodottoNome || 'Servizio fotografico',
              status: booking.stato,
              data: booking,
            });
          }
        }
      }

      for (const orderId of cliente.sourceRefs.orderIds || []) {
        const order = await loadOrder(orderId);
        if (order) {
          const date = parseDate(order.createdAt);
          if (date) {
            allEvents.push({
              id: orderId,
              type: 'order',
              date,
              title: 'Ordine',
              description: `€${order.totale?.toFixed(2) || '0.00'} - ${order.prodotti?.length || 0} prodotti`,
              status: order.stato,
              data: order,
            });
          }
        }
      }

      for (const galleryId of cliente.sourceRefs.galleryIds || []) {
        const gallery = await loadGallery(galleryId);
        if (gallery) {
          const date = parseDate(gallery.createdAt);
          if (date) {
            allEvents.push({
              id: galleryId,
              type: 'gallery',
              date,
              title: 'Galleria',
              description: `${gallery.name} - ${gallery.photoCount || 0} foto`,
              link: `/gallery/${gallery.code}`,
              data: gallery,
            });
          }
        }
      }

      for (const passwordRequestId of cliente.sourceRefs.passwordRequestIds || []) {
        const passwordRequest = await loadPasswordRequest(passwordRequestId);
        if (passwordRequest) {
          const date = parseDate(passwordRequest.requestDate);
          if (date) {
            allEvents.push({
              id: passwordRequestId,
              type: 'passwordRequest',
              date,
              title: 'Richiesta Password',
              description: `Richiesta accesso galleria da ${passwordRequest.firstName} ${passwordRequest.lastName}`,
              data: passwordRequest,
            });
          }
        }
      }

      for (const userId of cliente.sourceRefs.userIds || []) {
        const user = await loadUser(userId);
        if (user) {
          const date = parseDate(user.createdAt);
          if (date) {
            allEvents.push({
              id: userId,
              type: 'user',
              date,
              title: 'Registrazione Utente',
              description: `Account registrato: ${user.email}${user.displayName ? ` (${user.displayName})` : ''}`,
              data: user,
            });
          }
        }
      }

      for (const jobId of cliente.sourceRefs.jobIds || []) {
        const job = await loadJob(jobId);
        if (job) {
          const date = parseDate(job.eventDate);
          if (date) {
            allEvents.push({
              id: jobId,
              type: 'job',
              date,
              title: 'Lavoro',
              description: job.nomeEvento || 'Servizio fotografico',
              status: job.status,
              link: `/admin/jobs/${jobId}`,
              data: job,
            });
          }
        }
      }

      return allEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="storico-loading">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" data-testid="storico-error">
        <AlertDescription>
          Errore nel caricamento dello storico: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  if (events.length === 0) {
    return (
      <div 
        className="text-center py-8 text-muted-foreground"
        data-testid="storico-empty"
      >
        Nessuna attività registrata per questo cliente
      </div>
    );
  }

  const getEventIcon = (type: TimelineEvent['type']) => {
    switch (type) {
      case 'booking':
        return <Calendar className="h-5 w-5 text-[hsl(var(--blue-gray))]" />;
      case 'order':
        return <ShoppingCart className="h-5 w-5 text-[hsl(var(--terracotta))]" />;
      case 'gallery':
        return <ImageIcon className="h-5 w-5 text-[hsl(var(--sage))]" />;
      case 'passwordRequest':
        return <Lock className="h-5 w-5 text-orange-500" />;
      case 'user':
        return <User className="h-5 w-5 text-purple-500" />;
      case 'job':
        return <Briefcase className="h-5 w-5 text-indigo-500" />;
    }
  };

  const getStatusBadge = (type: string, status?: string) => {
    if (!status) return null;
    
    const variants: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; label: string }> = {
      'in_attesa': { variant: 'outline', label: 'In Attesa' },
      'confermata': { variant: 'default', label: 'Confermata' },
      'completata': { variant: 'secondary', label: 'Completata' },
      'annullata': { variant: 'destructive', label: 'Annullata' },
      'in_lavorazione': { variant: 'outline', label: 'In Lavorazione' },
      'pronto': { variant: 'default', label: 'Pronto' },
      'consegnato': { variant: 'secondary', label: 'Consegnato' },
      'lead': { variant: 'outline', label: 'Lead' },
      'preventivo_inviato': { variant: 'outline', label: 'Preventivo Inviato' },
      'confermato': { variant: 'default', label: 'Confermato' },
      'shooting_fatto': { variant: 'default', label: 'Shooting Fatto' },
      'selezione_pending': { variant: 'outline', label: 'Selezione Pending' },
      'produzione': { variant: 'outline', label: 'In Produzione' },
      'archiviato': { variant: 'secondary', label: 'Archiviato' },
    };

    const config = variants[status] || { variant: 'outline' as const, label: status };
    
    return (
      <Badge variant={config.variant} className="text-xs">
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6" data-testid="storico-timeline">
      <div className="relative">
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
        
        <div className="space-y-6">
          {events.map((event, index) => (
            <div 
              key={event.id} 
              className="relative flex gap-4"
              data-testid={`timeline-event-${event.type}-${event.id}`}
            >
              <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-background border-2 border-border">
                {getEventIcon(event.type)}
              </div>
              
              <Card className="flex-1 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-sm">{event.title}</h4>
                      {getStatusBadge(event.type, event.status)}
                    </div>
                    <p className="text-sm text-muted-foreground mb-2">
                      {event.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(event.date, "d MMMM yyyy 'alle' HH:mm", { locale: it })}
                    </p>
                  </div>
                  
                  {event.link && (
                    <a
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80"
                      data-testid={`link-event-${event.id}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

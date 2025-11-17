import { useQuery } from '@tanstack/react-query';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export interface Notification {
  id: string;
  type: 'booking' | 'consultation' | 'comment' | 'selection';
  title: string;
  description: string;
  createdAt: Timestamp | null;
  isRead: boolean;
  resourceId: string;
  deepLink: string;
}

export function useNotifications() {
  return useQuery({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const notifications: Notification[] = [];

      // 🚀 Batching parallelo con gestione errori robusta
      const fetchBookings = async () => {
        try {
          const bookingsRef = collection(db, 'bookings');
          // 🔧 Fix: Firestore non trova campi undefined con == null
          // Carica booking in_attesa o confermata, poi filtra lato client
          const bookingsQuery = query(
            bookingsRef,
            where('stato', 'in', ['in_attesa', 'confermata'])
          );
          const bookingsSnap = await getDocs(bookingsQuery);

          // Filtra solo quelli non visualizzati
          return bookingsSnap.docs
            .filter(doc => !doc.data().dataVisualizzazione)
            .map(doc => {
              const data = doc.data();
              const dataInizio = data.dataShootingInizio?.toDate ? data.dataShootingInizio.toDate() : null;
              const dataStr = dataInizio ? new Date(dataInizio).toLocaleDateString('it-IT') : 'Data non disponibile';

              return {
                id: `booking-${doc.id}`,
                type: 'booking' as const,
                title: 'Nuova Prenotazione',
                description: `${data.cliente?.cognome || ''} ${data.cliente?.nome || ''} - ${dataStr}`,
                createdAt: data.createdAt || null,
                isRead: false,
                resourceId: doc.id,
                deepLink: `/admin/dashboard?tab=prenotazioni&booking=${doc.id}`
              };
            });
        } catch (error) {
          console.error('[Notifications] Errore fetch bookings:', error);
          return [];
        }
      };

      const fetchConsultations = async () => {
        try {
          const consultationsRef = collection(db, 'consultations');
          // 🔧 Fix: Include sia in_attesa che confermata (finché non visualizzate)
          const consultationsQuery = query(
            consultationsRef,
            where('stato', 'in', ['in_attesa', 'confermata'])
          );
          const consultationsSnap = await getDocs(consultationsQuery);

          // Filtra solo quelle non visualizzate
          return consultationsSnap.docs
            .filter(doc => !doc.data().dataVisualizzazione)
            .map(doc => {
              const data = doc.data();
              const statoLabel = data.stato === 'confermata' ? ' ✅' : '';

              return {
                id: `consultation-${doc.id}`,
                type: 'consultation' as const,
                title: `Nuova Consulenza${statoLabel}`,
                description: `${data.cliente?.cognome || ''} ${data.cliente?.nome || ''} - ${data.jobType || 'Servizio non specificato'}`,
                createdAt: data.createdAt || null,
                isRead: false,
                resourceId: doc.id,
                deepLink: `/admin/dashboard?tab=consulenze&consultation=${doc.id}`
              };
            });
        } catch (error) {
          console.error('[Notifications] Errore fetch consultations:', error);
          return [];
        }
      };

      const fetchComments = async () => {
        try {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const commentsRef = collection(db, 'comments');
          const commentsQuery = query(
            commentsRef,
            orderBy('createdAt', 'desc'),
            limit(20)
          );
          const commentsSnap = await getDocs(commentsQuery);

          return commentsSnap.docs
            .map(doc => {
              const data = doc.data();
              const commentDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;

              if (!commentDate || commentDate < sevenDaysAgo) return null;

              const contentPreview = data.content ? data.content.substring(0, 50) : 'Nessun contenuto';
              return {
                id: `comment-${doc.id}`,
                type: 'comment' as const,
                title: 'Nuovo Commento',
                description: `${data.userName || 'Utente'}: "${contentPreview}..."`,
                createdAt: data.createdAt || null,
                isRead: true,
                resourceId: data.galleryId || '',
                deepLink: `/admin/galleries/${data.galleryId || ''}`
              } as Notification;
            })
            .filter((n): n is Notification => n !== null && n !== undefined);
        } catch (error) {
          console.error('[Notifications] Errore fetch comments:', error);
          return [];
        }
      };

      const fetchSelections = async () => {
        try {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          sevenDaysAgo.setHours(0, 0, 0, 0);

          const galleriesRef = collection(db, 'galleries');
          const completedSelectionsQuery = query(
            galleriesRef,
            where('selectionStatus', '==', 'completed')
          );

          const completedSnap = await getDocs(completedSelectionsQuery);

          return completedSnap.docs
            .map(doc => {
              const data = doc.data();
              const updatedDate = data.updatedAt?.toDate ? data.updatedAt.toDate() : null;

              if (!updatedDate || updatedDate < sevenDaysAgo || !data.bookingId) return null;

              let photoCount = 0;
              let requiredCount = 0;

              if (data.photoAssignments && Object.keys(data.photoAssignments).length > 0) {
                photoCount = Object.keys(data.photoAssignments).length;
                requiredCount = data.productRequirements?.reduce((sum: number, p: any) => 
                  sum + (p.prodottoNumeroFoto || 0), 0) || 0;
              } else {
                photoCount = data.selectedPhotoIds?.length || 0;
                requiredCount = data.requiredPhotoCount || 0;
              }

              return {
                id: `approved-selection-${doc.id}`,
                type: 'selection' as const,
                title: '✅ Selezione Approvata',
                description: `${data.clientName || 'Cliente'} ha confermato la selezione: ${photoCount}/${requiredCount} foto`,
                createdAt: data.updatedAt || null,
                isRead: false,
                resourceId: data.bookingId,
                deepLink: `/admin/dashboard?tab=prenotazioni&booking=${data.bookingId}`
              } as Notification;
            })
            .filter((n): n is Notification => n !== null && n !== undefined);
        } catch (error) {
          console.error('[Notifications] Errore fetch approved selections:', error);
          return [];
        }
      };

      // 🚀 Esegui tutte le fetch in parallelo per massima performance
      const [bookings, consultations, comments, selections] = await Promise.all([
        fetchBookings(),
        fetchConsultations(),
        fetchComments(),
        fetchSelections()
      ]);

      // Combina e ordina tutte le notifiche
      const allNotifications = [...bookings, ...consultations, ...comments, ...selections];

      return allNotifications.sort((a, b) => {
        if (!a || !b) return 0;
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
    },
    refetchInterval: 30000,
    staleTime: 10000, // 🚀 Cache valida per 10 secondi
  });
}
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
      
      try {
        const bookingsRef = collection(db, 'bookings');
        const bookingsQuery = query(
          bookingsRef,
          where('dataVisualizzazione', '==', null)
        );
        const bookingsSnap = await getDocs(bookingsQuery);
        bookingsSnap.forEach(doc => {
          const data = doc.data();
          const dataInizio = data.dataShootingInizio?.toDate ? data.dataShootingInizio.toDate() : null;
          const dataStr = dataInizio ? new Date(dataInizio).toLocaleDateString('it-IT') : 'Data non disponibile';
          
          notifications.push({
            id: `booking-${doc.id}`,
            type: 'booking',
            title: 'Nuova Prenotazione',
            description: `${data.cliente?.cognome || ''} ${data.cliente?.nome || ''} - ${dataStr}`,
            createdAt: data.createdAt || null,
            isRead: false,
            resourceId: doc.id,
            deepLink: `/admin?tab=prenotazioni&section=bookings&booking=${doc.id}`
          });
        });
      } catch (error) {
        console.error('[Notifications] Errore fetch bookings:', error);
      }
      
      try {
        const consultationsRef = collection(db, 'consultations');
        const consultationsQuery = query(
          consultationsRef,
          where('dataVisualizzazione', '==', null)
        );
        const consultationsSnap = await getDocs(consultationsQuery);
        consultationsSnap.forEach(doc => {
          const data = doc.data();
          notifications.push({
            id: `consultation-${doc.id}`,
            type: 'consultation',
            title: 'Nuova Consulenza',
            description: `${data.cliente?.cognome || ''} ${data.cliente?.nome || ''} - ${data.jobType || 'Servizio non specificato'}`,
            createdAt: data.createdAt || null,
            isRead: false,
            resourceId: doc.id,
            deepLink: `/admin?tab=consulenze&consultation=${doc.id}`
          });
        });
      } catch (error) {
        console.error('[Notifications] Errore fetch consultations:', error);
      }
      
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
        commentsSnap.forEach(doc => {
          const data = doc.data();
          const commentDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          if (commentDate && commentDate >= sevenDaysAgo) {
            const contentPreview = data.content ? data.content.substring(0, 50) : 'Nessun contenuto';
            notifications.push({
              id: `comment-${doc.id}`,
              type: 'comment',
              title: 'Nuovo Commento',
              description: `${data.userName || 'Utente'}: "${contentPreview}..."`,
              createdAt: data.createdAt || null,
              isRead: true,
              resourceId: data.galleryId || '',
              deepLink: `/admin/galleries/${data.galleryId || ''}`
            });
          }
        });
      } catch (error) {
        console.error('[Notifications] Errore fetch comments:', error);
      }
      
      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const selectionsRef = collection(db, 'photoSelections');
        const selectionsQuery = query(
          selectionsRef,
          orderBy('selectedAt', 'desc'),
          limit(20)
        );
        const selectionsSnap = await getDocs(selectionsQuery);
        selectionsSnap.forEach(doc => {
          const data = doc.data();
          const selectionDate = data.selectedAt?.toDate ? data.selectedAt.toDate() : null;
          if (selectionDate && selectionDate >= sevenDaysAgo) {
            notifications.push({
              id: `selection-${doc.id}`,
              type: 'selection',
              title: 'Nuova Selezione Foto',
              description: `${data.selectedByName || 'Cliente'} ha selezionato una foto`,
              createdAt: data.selectedAt || null,
              isRead: true,
              resourceId: data.galleryId || '',
              deepLink: `/admin/galleries/${data.galleryId || ''}`
            });
          }
        });
      } catch (error: any) {
        if (error?.code !== 'permission-denied') {
          console.error('[Notifications] Errore fetch selections:', error);
        }
      }
      
      return notifications.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB.getTime() - dateA.getTime();
      });
    },
    refetchInterval: 30000,
  });
}

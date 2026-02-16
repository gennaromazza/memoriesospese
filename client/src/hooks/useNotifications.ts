import { useQuery } from '@tanstack/react-query';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { apiRequest } from '@/lib/queryClient';

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
      
      // 🚀 Fetch bookings e consultations via API server-side
      const fetchBookingsAndConsultations = async () => {
        try {
          const response = await apiRequest('GET', '/api/jobs/notifications');
          if (!response.ok) {
            console.error('[Notifications] API error:', response.status);
            return [];
          }
          const data = await response.json();
          return data.notifications || [];
        } catch (error) {
          console.error('[Notifications] Errore fetch notifications:', error);
          return [];
        }
      };
      
      const fetchComments = async () => {
        try {
          // FIX: Usa math per calcolo date (evita setDate())
          const sevenDaysAgo = new Date(new Date().getTime() - 7 * 86400000);
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
          // FIX: Usa math per calcolo date (evita setDate() e setHours())
          const date = new Date(new Date().getTime() - 7 * 86400000);
          const sevenDaysAgo = new Date(date.getFullYear(), date.getMonth(), date.getDate());
          
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
      const [bookingsAndConsultations, comments, selections] = await Promise.all([
        fetchBookingsAndConsultations(),
        fetchComments(),
        fetchSelections()
      ]);
      
      // Combina e ordina tutte le notifiche
      const allNotifications = [...bookingsAndConsultations, ...comments, ...selections];
      
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

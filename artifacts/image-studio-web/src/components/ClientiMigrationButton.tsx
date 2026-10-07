import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Upload, Loader2 } from 'lucide-react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createCliente } from '@/lib/clienti';
import type { InsertCliente } from '@shared/clienti-types';

/** Intermediate shape used during migration aggregation before calling createCliente */
interface MigrationCliente extends InsertCliente {
  sourceRefs: {
    bookingIds: string[];
    orderIds: string[];
    galleryIds: string[];
  };
}
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function ClientiMigrationButton() {
  const { toast } = useToast();
  const [isMigrating, setIsMigrating] = useState(false);

  const handleMigration = async () => {
    setIsMigrating(true);
    
    try {
      const clientiMap = new Map<string, MigrationCliente>();
      
      // Step 1: Aggrega da bookings
      const bookingsSnapshot = await getDocs(collection(db, 'bookings'));
      let bookingsProcessed = 0;
      
      for (const doc of bookingsSnapshot.docs) {
        const booking = doc.data();
        const email = booking.cliente?.email?.toLowerCase().trim();
        
        if (!email || email === 'nessuna_email@nd.com') continue;
        
        if (!clientiMap.has(email)) {
          clientiMap.set(email, {
            nome: booking.cliente?.nome || 'N/D',
            cognome: booking.cliente?.cognome || 'N/D',
            email: email,
            cellulare1: booking.cliente?.cellulare || booking.cliente?.cellulare1 || 'N/D',
            whatsapp: booking.cliente?.whatsapp || booking.cliente?.cellulare || 'N/D',
            via: 'N/D',
            citta: 'N/D',
            cap: 'N/D',
            provincia: 'N/D',
            note: `Cliente importato da booking #${doc.id}`,
            tags: [],
            sourceRefs: {
              bookingIds: [],
              orderIds: [],
              galleryIds: []
            }
          });
        }
        
        const cliente = clientiMap.get(email)!;
        cliente.sourceRefs.bookingIds.push(doc.id);
        bookingsProcessed++;
      }
      
      // Step 2: Aggrega da orders
      const ordersSnapshot = await getDocs(collection(db, 'orders'));
      let ordersProcessed = 0;
      
      for (const doc of ordersSnapshot.docs) {
        const order = doc.data();
        const email = order.cliente?.email?.toLowerCase().trim();
        
        if (!email || email === 'nessuna_email@nd.com') continue;
        
        if (!clientiMap.has(email)) {
          clientiMap.set(email, {
            nome: order.cliente?.nome || 'N/D',
            cognome: order.cliente?.cognome || 'N/D',
            email: email,
            cellulare1: order.cliente?.cellulare || order.cliente?.cellulare1 || 'N/D',
            whatsapp: order.cliente?.whatsapp || order.cliente?.cellulare || 'N/D',
            via: 'N/D',
            citta: 'N/D',
            cap: 'N/D',
            provincia: 'N/D',
            note: `Cliente importato da ordine #${doc.id}`,
            tags: [],
            sourceRefs: {
              bookingIds: [],
              orderIds: [],
              galleryIds: []
            }
          });
        }
        
        const cliente = clientiMap.get(email)!;
        cliente.sourceRefs.orderIds.push(doc.id);
        ordersProcessed++;
      }
      
      // Step 3: Aggrega da galleries (campo cliente)
      const galleriesSnapshot = await getDocs(collection(db, 'galleries'));
      let galleriesProcessed = 0;
      
      for (const doc of galleriesSnapshot.docs) {
        const gallery = doc.data();
        const email = gallery.cliente?.email?.toLowerCase().trim() || gallery.email?.toLowerCase().trim();
        
        if (!email || email === 'nessuna_email@nd.com') continue;
        
        if (!clientiMap.has(email)) {
          clientiMap.set(email, {
            nome: gallery.cliente?.nome || gallery.nome || 'N/D',
            cognome: gallery.cliente?.cognome || gallery.cognome || 'N/D',
            email: email,
            cellulare1: 'N/D',
            whatsapp: 'N/D',
            via: 'N/D',
            citta: 'N/D',
            cap: 'N/D',
            provincia: 'N/D',
            note: `Cliente importato da gallery ${gallery.name || gallery.code}`,
            tags: [],
            sourceRefs: {
              bookingIds: [],
              orderIds: [],
              galleryIds: []
            }
          });
        }
        
        const cliente = clientiMap.get(email)!;
        cliente.sourceRefs.galleryIds.push(doc.id);
        galleriesProcessed++;
      }
      
      // Step 4: Crea clienti in Firestore
      const clientiArray = Array.from(clientiMap.values());
      let created = 0;
      let errors = 0;
      
      for (const clienteData of clientiArray) {
        try {
          await createCliente(clienteData);
          created++;
        } catch (error) {
          console.error('Errore creazione cliente:', error);
          errors++;
        }
      }
      
      toast({
        title: '✅ Migrazione completata!',
        description: `${created} clienti creati con successo. Elaborati ${bookingsProcessed} bookings, ${ordersProcessed} ordini, ${galleriesProcessed} gallerie. ${errors > 0 ? `${errors} errori.` : ''}`,
      });
      
    } catch (error: unknown) {
      toast({
        title: '❌ Errore migrazione',
        description: error instanceof Error ? error.message : 'Errore sconosciuto',
        variant: 'destructive',
      });
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="outline" 
          className="border-blue-600 text-blue-600 hover:bg-blue-50"
          data-testid="button-migrate-clienti"
        >
          <Upload className="w-4 h-4 mr-2" />
          Importa Clienti Esistenti
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Importa Clienti Esistenti</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>
              Questa operazione aggregherà tutti i clienti da:
            </p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li>Prenotazioni (bookings)</li>
              <li>Ordini (orders)</li>
              <li>Gallerie (galleries)</li>
            </ul>
            <p className="text-orange-600 font-medium mt-4">
              ⚠️ I clienti con la stessa email verranno unificati. Questa operazione non può essere annullata.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMigrating}>Annulla</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleMigration}
            disabled={isMigrating}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isMigrating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importazione in corso...
              </>
            ) : (
              'Avvia Importazione'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default ClientiMigrationButton;

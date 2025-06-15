import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Download, Search, Calendar, Mail, Trash, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, where, deleteDoc, doc } from 'firebase/firestore';
import * as XLSX from 'xlsx';

interface SubscriptionData {
  id: string;
  galleryId: string;
  galleryName: string;
  email: string;
  createdAt: any;
  active: boolean;
}

interface GalleryData {
  id: string;
  name: string;
  subscriptionCount: number;
}

export default function SubscriptionsManager() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [galleries, setGalleries] = useState<GalleryData[]>([]);
  const [filteredSubscriptions, setFilteredSubscriptions] = useState<SubscriptionData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGallery, setSelectedGallery] = useState<string>('all');
  const { toast } = useToast();

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    try {
      // Recupera tutte le iscrizioni
      const subscriptionsQuery = query(
        collection(db, 'subscriptions'),
        orderBy('createdAt', 'desc')
      );
      
      const subscriptionsSnapshot = await getDocs(subscriptionsQuery);
      const subscriptionsData = subscriptionsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          galleryId: data.galleryId,
          galleryName: data.galleryName,
          email: data.email,
          createdAt: data.createdAt,
          active: data.active !== false
        } as SubscriptionData;
      });

      // Recupera le gallerie per il filtro
      const galleriesQuery = query(collection(db, 'galleries'));
      const galleriesSnapshot = await getDocs(galleriesQuery);
      const galleriesData = galleriesSnapshot.docs.map(doc => {
        const data = doc.data();
        const subscriptionCount = subscriptionsData.filter(sub => sub.galleryId === doc.id).length;
        return {
          id: doc.id,
          name: data.name,
          subscriptionCount
        } as GalleryData;
      });

      setSubscriptions(subscriptionsData);
      setGalleries(galleriesData);
      setFilteredSubscriptions(subscriptionsData);
    } catch (error) {
      console.error('Errore nel recuperare le iscrizioni:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare le iscrizioni",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    applyFilters(term, selectedGallery);
  };

  const handleGalleryFilter = (galleryId: string) => {
    setSelectedGallery(galleryId);
    applyFilters(searchTerm, galleryId);
  };

  const applyFilters = (searchTerm: string, galleryId: string) => {
    let filtered = subscriptions;

    if (galleryId !== 'all') {
      filtered = filtered.filter(sub => sub.galleryId === galleryId);
    }

    if (searchTerm) {
      filtered = filtered.filter(sub =>
        sub.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.galleryName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredSubscriptions(filtered);
  };

  const removeSubscription = async (subscriptionId: string, email: string, galleryName: string) => {
    try {
      await deleteDoc(doc(db, 'subscriptions', subscriptionId));
      
      toast({
        title: "Iscrizione rimossa",
        description: `${email} non riceverà più notifiche da "${galleryName}"`,
      });

      // Ricarica i dati
      fetchSubscriptions();
    } catch (error) {
      console.error('Errore nella rimozione:', error);
      toast({
        title: "Errore",
        description: "Impossibile rimuovere l'iscrizione",
        variant: "destructive",
      });
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportToExcel = () => {
    if (filteredSubscriptions.length === 0) {
      toast({
        title: "Nessun dato",
        description: "Non ci sono iscrizioni da esportare",
        variant: "destructive",
      });
      return;
    }

    const exportData = filteredSubscriptions.map(sub => ({
      'Email': sub.email,
      'Galleria': sub.galleryName,
      'Data Iscrizione': formatDate(sub.createdAt),
      'Stato': sub.active ? 'Attiva' : 'Disattivata',
      'ID Galleria': sub.galleryId
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Iscrizioni Email');
    
    const fileName = `iscrizioni-email-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Export completato",
      description: `File ${fileName} scaricato con successo`,
    });
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  return (
    <div className="space-y-6">
      {/* Statistiche per galleria */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="text-2xl font-bold text-blue-600">{subscriptions.length}</div>
          <div className="text-sm text-blue-800">Iscrizioni Totali</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-2xl font-bold text-green-600">{galleries.length}</div>
          <div className="text-sm text-green-800">Gallerie con Iscrizioni</div>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <div className="text-2xl font-bold text-purple-600">
            {subscriptions.filter(s => s.active).length}
          </div>
          <div className="text-sm text-purple-800">Iscrizioni Attive</div>
        </div>
      </div>

      {/* Filtri e ricerca */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 items-center flex-1">
          <Search className="h-4 w-4 text-gray-400" />
          <Input
            placeholder="Cerca per email o galleria..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="max-w-sm"
          />
          
          <Select value={selectedGallery} onValueChange={handleGalleryFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtra per galleria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le gallerie</SelectItem>
              {galleries.map((gallery) => (
                <SelectItem key={gallery.id} value={gallery.id}>
                  {gallery.name} ({gallery.subscriptionCount})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={fetchSubscriptions}
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            {isLoading ? "Caricamento..." : "Aggiorna"}
          </Button>
          <Button
            onClick={exportToExcel}
            disabled={filteredSubscriptions.length === 0}
            className="bg-green-600 hover:bg-green-700"
            size="sm"
          >
            <Download className="h-4 w-4 mr-2" />
            Esporta Excel
          </Button>
        </div>
      </div>

      {/* Tabella iscrizioni */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Galleria</TableHead>
              <TableHead>Data Iscrizione</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Caricamento iscrizioni...
                </TableCell>
              </TableRow>
            ) : filteredSubscriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  {searchTerm || selectedGallery !== 'all' ? 
                    'Nessuna iscrizione trovata con i filtri selezionati' : 
                    'Nessuna iscrizione email presente'
                  }
                </TableCell>
              </TableRow>
            ) : (
              filteredSubscriptions.map((subscription) => (
                <TableRow key={subscription.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400" />
                      {subscription.email}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">
                    {subscription.galleryName}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{formatDate(subscription.createdAt)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={subscription.active ? 'default' : 'secondary'}>
                      {subscription.active ? 'Attiva' : 'Disattivata'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      onClick={() => removeSubscription(
                        subscription.id, 
                        subscription.email, 
                        subscription.galleryName
                      )}
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Riepilogo per galleria */}
      {galleries.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Riepilogo per Galleria</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {galleries
              .sort((a, b) => b.subscriptionCount - a.subscriptionCount)
              .map((gallery) => (
                <div 
                  key={gallery.id} 
                  className="bg-white p-3 rounded border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm truncate mr-2">{gallery.name}</div>
                    <Badge variant="outline" className="bg-blue-50 text-blue-700">
                      {gallery.subscriptionCount}
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
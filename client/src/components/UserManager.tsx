import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Download, Search, Calendar, Mail, UserCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';

interface UserData {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  createdAt: any;
  lastLoginAt: any;
  galleries: string[];
  photoCount?: number;
}

export default function UserManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { toast } = useToast();

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const usersQuery = query(
        collection(db, 'users'),
        orderBy('createdAt', 'desc')
      );
      
      const usersSnapshot = await getDocs(usersQuery);
      const usersData = usersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          uid: data.uid,
          name: data.name,
          email: data.email,
          role: data.role || 'guest',
          createdAt: data.createdAt,
          lastLoginAt: data.lastLoginAt,
          galleries: data.galleries || [],
          photoCount: 0 // Sarà calcolato dopo
        } as UserData;
      });

      // Calcola il numero di foto caricate da ogni utente
      for (const user of usersData) {
        let totalPhotos = 0;
        for (const galleryId of user.galleries) {
          try {
            const photosQuery = query(
              collection(db, 'galleries', galleryId, 'photos'),
              // Filtra per le foto caricate da questo utente
            );
            const photosSnapshot = await getDocs(photosQuery);
            const userPhotos = photosSnapshot.docs.filter(doc => 
              doc.data().uploaderUid === user.uid
            );
            totalPhotos += userPhotos.length;
          } catch (error) {
            console.error(`Errore nel calcolare le foto per la galleria ${galleryId}:`, error);
          }
        }
        user.photoCount = totalPhotos;
      }

      setUsers(usersData);
      setFilteredUsers(usersData);
    } catch (error) {
      console.error('Errore nel recuperare gli utenti:', error);
      toast({
        title: "Errore",
        description: "Impossibile caricare la lista degli utenti",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (!term) {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user =>
        user.name.toLowerCase().includes(term.toLowerCase()) ||
        user.email.toLowerCase().includes(term.toLowerCase())
      );
      setFilteredUsers(filtered);
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
    if (users.length === 0) {
      toast({
        title: "Nessun dato",
        description: "Non ci sono utenti da esportare",
        variant: "destructive",
      });
      return;
    }

    const exportData = users.map(user => ({
      'Nome': user.name,
      'Email': user.email,
      'Ruolo': user.role,
      'Data Registrazione': formatDate(user.createdAt),
      'Ultimo Accesso': formatDate(user.lastLoginAt),
      'Numero Gallerie': user.galleries.length,
      'Foto Caricate': user.photoCount || 0,
      'ID Gallerie': user.galleries.join(', ')
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Utenti Registrati');
    
    const fileName = `utenti-registrati-${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);

    toast({
      title: "Export completato",
      description: `File ${fileName} scaricato con successo`,
    });
  };

  useEffect(() => {
    if (isDialogOpen) {
      fetchUsers();
    }
  }, [isDialogOpen]);

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="bg-white hover:bg-gray-50 border-gray-300"
        >
          <Users className="h-4 w-4 mr-2" />
          Gestisci Utenti
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Gestione Utenti Registrati
          </DialogTitle>
          <DialogDescription>
            Visualizza ed esporta tutti gli utenti che si sono registrati per caricare foto
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Barra degli strumenti */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gray-400" />
              <Input
                placeholder="Cerca per nome o email..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-64"
              />
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={fetchUsers}
                disabled={isLoading}
                variant="outline"
                size="sm"
              >
                {isLoading ? "Caricamento..." : "Aggiorna"}
              </Button>
              <Button
                onClick={exportToExcel}
                disabled={users.length === 0}
                className="bg-green-600 hover:bg-green-700"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Esporta Excel
              </Button>
            </div>
          </div>

          {/* Statistiche */}
          <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{users.length}</div>
              <div className="text-sm text-gray-600">Utenti Totali</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {users.reduce((sum, user) => sum + (user.photoCount || 0), 0)}
              </div>
              <div className="text-sm text-gray-600">Foto Caricate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {users.reduce((sum, user) => sum + user.galleries.length, 0)}
              </div>
              <div className="text-sm text-gray-600">Accessi Gallerie</div>
            </div>
          </div>

          {/* Tabella utenti */}
          <div className="border rounded-md max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Ruolo</TableHead>
                  <TableHead>Registrazione</TableHead>
                  <TableHead>Ultimo Accesso</TableHead>
                  <TableHead>Gallerie</TableHead>
                  <TableHead>Foto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Caricamento utenti...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      {searchTerm ? 'Nessun utente trovato' : 'Nessun utente registrato'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4 text-green-600" />
                          {user.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-400" />
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                          {user.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className="text-sm">{formatDate(user.createdAt)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{formatDate(user.lastLoginAt)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {user.galleries.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-blue-50 text-blue-700">
                          {user.photoCount || 0}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
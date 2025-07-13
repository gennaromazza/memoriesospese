import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Users, Download, Search, Calendar, Mail, UserCheck, Edit, MoreVertical, Eye, Key, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, query, orderBy, doc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import * as XLSX from 'xlsx';

interface UserData {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  createdAt: Timestamp;
  lastLoginAt: Timestamp | null;
  galleries: string[];
  photoCount?: number;
}

export default function UserManager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [users, setUsers] = useState<UserData[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', role: '' });
  const [deleteUser, setDeleteUser] = useState<UserData | null>(null);
  const [detailsUser, setDetailsUser] = useState<UserData | null>(null);
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

  const formatDate = (timestamp: Timestamp | null | undefined) => {
    if (!timestamp || !timestamp.toDate) return 'N/A';
    return timestamp.toDate().toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleEditUser = (user: UserData) => {
    setEditingUser(user);
    setEditForm({ name: user.name, role: user.role });
    setEditDialogOpen(true);
  };

  const handleSaveUser = async () => {
    if (!editingUser) return;

    try {
      const userRef = doc(db, 'users', editingUser.id);
      await updateDoc(userRef, {
        name: editForm.name,
        role: editForm.role,
        updatedAt: new Date()
      });

      // Aggiorna la lista locale
      const updatedUsers = users.map(u => 
        u.id === editingUser.id 
          ? { ...u, name: editForm.name, role: editForm.role }
          : u
      );
      setUsers(updatedUsers);
      setFilteredUsers(updatedUsers);

      toast({
        title: "Utente aggiornato",
        description: "Le modifiche sono state salvate con successo",
      });

      setEditDialogOpen(false);
      setEditingUser(null);
    } catch (error) {
      console.error('Errore nel salvare le modifiche:', error);
      toast({
        title: "Errore",
        description: "Impossibile salvare le modifiche",
        variant: "destructive",
      });
    }
  };

  const handleViewDetails = (user: UserData) => {
    setDetailsUser(user);
  };

  const handleResetPassword = async (user: UserData) => {
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({
        title: "Email inviata",
        description: `Email di reset password inviata a ${user.email}`,
      });
    } catch (error) {
      console.error('Errore nel reset password:', error);
      toast({
        title: "Errore",
        description: "Impossibile inviare l'email di reset password",
        variant: "destructive",
      });
    }
  };

  const handleDeleteUser = (user: UserData) => {
    setDeleteUser(user);
  };

  const confirmDeleteUser = async () => {
    if (!deleteUser) return;

    try {
      // Elimina il documento utente
      await deleteDoc(doc(db, 'users', deleteUser.id));

      // Aggiorna la lista locale
      const updatedUsers = users.filter(u => u.id !== deleteUser.id);
      setUsers(updatedUsers);
      setFilteredUsers(updatedUsers);

      toast({
        title: "Utente eliminato",
        description: "L'utente è stato eliminato con successo",
      });

      setDeleteUser(null);
    } catch (error) {
      console.error('Errore nell\'eliminazione:', error);
      toast({
        title: "Errore",
        description: "Impossibile eliminare l'utente",
        variant: "destructive",
      });
    }
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
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      Caricamento utenti...
                    </TableCell>
                  </TableRow>
                ) : filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
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
                        <Badge 
                          variant={user.role === 'admin' ? 'default' : user.role === 'user' ? 'secondary' : 'outline'}
                          className={user.role === 'admin' ? 'bg-blue-600' : ''}
                        >
                          {user.role === 'admin' ? 'Amministratore' : user.role === 'user' ? 'Utente' : 'Ospite'}
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
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditUser(user)}
                            className="h-8 w-8 p-0"
                            title="Modifica utente"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetails(user)}>
                                <Eye className="h-4 w-4 mr-2" />
                                Visualizza dettagli
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                                <Key className="h-4 w-4 mr-2" />
                                Reset password
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteUser(user)}
                                className="text-red-600 focus:text-red-600"
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Elimina utente
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>

      {/* Dialog per modificare utente */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifica Utente</DialogTitle>
            <DialogDescription>
              Modifica le informazioni dell'utente
            </DialogDescription>
          </DialogHeader>
          
          {editingUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Nome utente"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  value={editingUser.email}
                  disabled
                  className="bg-gray-50"
                />
                <p className="text-xs text-gray-500">L'email non può essere modificata</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-role">Ruolo</Label>
                <Select
                  value={editForm.role}
                  onValueChange={(value) => setEditForm({ ...editForm, role: value })}
                >
                  <SelectTrigger id="edit-role">
                    <SelectValue placeholder="Seleziona ruolo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Utente</SelectItem>
                    <SelectItem value="admin">Amministratore</SelectItem>
                    <SelectItem value="guest">Ospite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setEditDialogOpen(false)}
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleSaveUser}
                  disabled={!editForm.name}
                >
                  Salva Modifiche
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog conferma eliminazione */}
      <AlertDialog open={!!deleteUser} onOpenChange={() => setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare l'utente <strong>{deleteUser?.name}</strong> ({deleteUser?.email})?
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeleteUser}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog dettagli utente */}
      <Dialog open={!!detailsUser} onOpenChange={() => setDetailsUser(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Dettagli Utente</DialogTitle>
          </DialogHeader>
          {detailsUser && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">Nome</Label>
                  <p className="font-medium">{detailsUser.name}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Email</Label>
                  <p className="font-medium">{detailsUser.email}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Ruolo</Label>
                  <Badge variant={detailsUser.role === 'admin' ? 'default' : 'secondary'}>
                    {detailsUser.role}
                  </Badge>
                </div>
                <div>
                  <Label className="text-gray-500">ID Utente</Label>
                  <p className="font-mono text-xs">{detailsUser.uid}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Registrazione</Label>
                  <p className="text-sm">{formatDate(detailsUser.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Ultimo accesso</Label>
                  <p className="text-sm">{formatDate(detailsUser.lastLoginAt)}</p>
                </div>
              </div>
              
              <div>
                <Label className="text-gray-500">Gallerie associate ({detailsUser.galleries.length})</Label>
                <div className="mt-2 max-h-32 overflow-y-auto">
                  {detailsUser.galleries.length === 0 ? (
                    <p className="text-sm text-gray-500">Nessuna galleria associata</p>
                  ) : (
                    <div className="space-y-1">
                      {detailsUser.galleries.map((galleryId, index) => (
                        <Badge key={index} variant="outline" className="mr-2">
                          {galleryId}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t">
                <div>
                  <p className="text-sm text-gray-500">Foto caricate</p>
                  <p className="text-2xl font-bold text-blue-600">{detailsUser.photoCount || 0}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setDetailsUser(null)}
                >
                  Chiudi
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
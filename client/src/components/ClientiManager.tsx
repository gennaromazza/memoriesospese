import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import {
  getAllClienti,
  createCliente,
  updateCliente,
  deleteCliente,
  getClienteStats,
} from '@/lib/clienti';
import type { Cliente, InsertCliente, UpdateCliente, ClienteStats } from '@shared/clienti-types';
import ClientiTable from '@/components/ClientiTable';
import ClienteForm from '@/components/ClienteForm';
import ClienteDetailDrawer from '@/components/ClienteDetailDrawer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, TrendingUp, Euro, AlertCircle } from 'lucide-react';

export function ClientiManager() {
  const { toast } = useToast();
  
  // State management
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showFormDialog, setShowFormDialog] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  
  // Data fetching
  const { data: clienti = [], isLoading: isLoadingClienti } = useQuery({
    queryKey: ['/api/clienti'],
    queryFn: getAllClienti,
  });
  
  const { data: stats } = useQuery({
    queryKey: ['/api/clienti/stats'],
    queryFn: getClienteStats,
  });
  
  // Mutations
  const createMutation = useMutation({
    mutationFn: createCliente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clienti'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clienti/stats'] });
      toast({
        title: '✅ Cliente creato',
        description: 'Il cliente è stato aggiunto con successo.',
      });
      setShowFormDialog(false);
      setEditingCliente(null);
    },
    onError: (error) => {
      toast({
        title: '❌ Errore',
        description: `Impossibile creare il cliente: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCliente }) =>
      updateCliente(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clienti'] });
      toast({
        title: '✅ Cliente aggiornato',
        description: 'Le modifiche sono state salvate.',
      });
      setShowFormDialog(false);
      setEditingCliente(null);
    },
    onError: (error) => {
      toast({
        title: '❌ Errore',
        description: `Impossibile aggiornare il cliente: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  const deleteMutation = useMutation({
    mutationFn: deleteCliente,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clienti'] });
      queryClient.invalidateQueries({ queryKey: ['/api/clienti/stats'] });
      toast({
        title: '✅ Cliente eliminato',
        description: 'Il cliente è stato rimosso dal sistema.',
      });
      setDeleteConfirmId(null);
      if (selectedCliente?.id === deleteConfirmId) {
        setSelectedCliente(null);
        setShowDetailDrawer(false);
      }
    },
    onError: (error) => {
      toast({
        title: '❌ Errore',
        description: `Impossibile eliminare il cliente: ${error.message}`,
        variant: 'destructive',
      });
    },
  });
  
  // Handlers
  const handleCreateCliente = () => {
    setEditingCliente(null);
    setShowFormDialog(true);
  };
  
  const handleEditCliente = (cliente: Cliente) => {
    setEditingCliente(cliente);
    setShowFormDialog(true);
  };
  
  const handleSelectCliente = (cliente: Cliente) => {
    setSelectedCliente(cliente);
    setShowDetailDrawer(true);
  };
  
  const handleFormSubmit = (data: InsertCliente | UpdateCliente) => {
    if (editingCliente) {
      updateMutation.mutate({ id: editingCliente.id, data: data as UpdateCliente });
    } else {
      createMutation.mutate(data as InsertCliente);
    }
  };
  
  const handleAction = (cliente: Cliente, action: string) => {
    switch (action) {
      case 'edit':
        handleEditCliente(cliente);
        break;
      case 'delete':
        setDeleteConfirmId(cliente.id);
        break;
      case 'storico':
        handleSelectCliente(cliente);
        break;
      case 'email':
        window.location.href = `mailto:${cliente.email}`;
        break;
      case 'whatsapp':
        if (cliente.whatsapp && cliente.whatsapp !== 'N/D') {
          const phone = cliente.whatsapp.replace(/\D/g, '');
          window.open(`https://wa.me/${phone}`, '_blank');
        }
        break;
      case 'archive':
        updateMutation.mutate({
          id: cliente.id,
          data: { status: 'archiviato' },
        });
        break;
      case 'change-status':
        // TODO: Aprire dialog per cambiare status
        break;
      default:
        console.warn(`Azione non gestita: ${action}`);
    }
  };
  
  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      deleteMutation.mutate(deleteConfirmId);
    }
  };
  
  // Stats cards data
  const statsCards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        title: 'Clienti Totali',
        value: stats.totalClienti.toString(),
        icon: Users,
        color: 'text-blue-600',
      },
      {
        title: 'Clienti Attivi',
        value: stats.clientiAttivi.toString(),
        icon: TrendingUp,
        color: 'text-green-600',
      },
      {
        title: 'Fatturato Totale',
        value: `€${stats.totalRevenue.toFixed(2)}`,
        icon: Euro,
        color: 'text-sage',
      },
      {
        title: 'Saldo Pendente',
        value: `€${stats.outstandingTotal.toFixed(2)}`,
        icon: AlertCircle,
        color: stats.outstandingTotal > 0 ? 'text-orange-600' : 'text-gray-400',
      },
    ];
  }, [stats]);
  
  return (
    <div className="space-y-6" data-testid="clienti-manager">
      {/* Header con Stats */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-playfair font-bold text-blue-gray">
            Clienti
          </h2>
          <p className="text-gray-600 mt-1">
            Gestione clienti dello studio fotografico
          </p>
        </div>
        <Button
          onClick={handleCreateCliente}
          className="bg-sage hover:bg-sage/90"
          data-testid="button-create-cliente"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Cliente
        </Button>
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      
      {/* Tabella Clienti */}
      <Card>
        <CardContent className="p-6">
          <ClientiTable
            clienti={clienti}
            onSelectCliente={handleSelectCliente}
            onActionCliente={handleAction}
            isLoading={isLoadingClienti}
          />
        </CardContent>
      </Card>
      
      {/* Form Dialog (Create/Edit) */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-playfair">
              {editingCliente ? 'Modifica Cliente' : 'Nuovo Cliente'}
            </DialogTitle>
          </DialogHeader>
          <ClienteForm
            cliente={editingCliente}
            onSubmit={handleFormSubmit}
            onCancel={() => {
              setShowFormDialog(false);
              setEditingCliente(null);
            }}
            isSubmitting={createMutation.isPending || updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>
      
      {/* Detail Drawer */}
      <ClienteDetailDrawer
        cliente={selectedCliente}
        open={showDetailDrawer}
        onClose={() => {
          setShowDetailDrawer(false);
          setSelectedCliente(null);
        }}
        onAction={(action) => {
          if (selectedCliente) {
            handleAction(selectedCliente, action);
          }
        }}
      />
      
      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirmId}
        onOpenChange={(open) => !open && setDeleteConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conferma Eliminazione</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questo cliente? Questa azione è
              irreversibile. I collegamenti a booking, ordini e gallerie non
              saranno eliminati.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ClientiManager;

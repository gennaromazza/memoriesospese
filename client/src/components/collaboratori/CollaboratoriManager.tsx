
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, UserCheck, UserX, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  getAllCollaboratori,
  createCollaboratore,
  updateCollaboratore,
} from '@/lib/collaboratori';
import type { Collaboratore, InsertCollaboratore, CollaboratoreRole } from '@shared/collaboratori-types';

const RUOLI_LABELS: Record<CollaboratoreRole, string> = {
  fotografo_secondario: '📷 Fotografo Secondario',
  videomaker: '🎥 Videomaker',
  assistente: '🤝 Assistente',
  photo_editor: '🎨 Photo Editor',
  album_designer: '📚 Album Designer',
  altro: '👤 Altro',
};

export function CollaboratoriManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCollaboratore, setEditingCollaboratore] = useState<Collaboratore | null>(null);
  const [formData, setFormData] = useState<InsertCollaboratore>({
    nome: '',
    cognome: '',
    email: '',
    cellulare: '',
    ruolo: 'fotografo_secondario',
    tariffaOraria: undefined,
    tariffaGiornaliera: undefined,
    note: '',
    hasAccess: false,
  });

  const { data: collaboratori = [], isLoading } = useQuery({
    queryKey: ['collaboratori'],
    queryFn: () => getAllCollaboratori(false),
  });

  const createMutation = useMutation({
    mutationFn: createCollaboratore,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboratori'] });
      toast({ title: '✅ Collaboratore creato' });
      handleCloseModal();
    },
    onError: () => {
      toast({ title: '❌ Errore creazione', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      updateCollaboratore(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaboratori'] });
      toast({ title: '✅ Collaboratore aggiornato' });
      handleCloseModal();
    },
    onError: () => {
      toast({ title: '❌ Errore aggiornamento', variant: 'destructive' });
    },
  });

  const handleOpenModal = (collaboratore?: Collaboratore) => {
    if (collaboratore) {
      setEditingCollaboratore(collaboratore);
      setFormData({
        nome: collaboratore.nome,
        cognome: collaboratore.cognome,
        email: collaboratore.email,
        cellulare: collaboratore.cellulare,
        ruolo: collaboratore.ruolo,
        tariffaOraria: collaboratore.tariffaOraria,
        tariffaGiornaliera: collaboratore.tariffaGiornaliera,
        note: collaboratore.note,
        hasAccess: collaboratore.hasAccess,
      });
    } else {
      setEditingCollaboratore(null);
      setFormData({
        nome: '',
        cognome: '',
        email: '',
        cellulare: '',
        ruolo: 'fotografo_secondario',
        tariffaOraria: undefined,
        tariffaGiornaliera: undefined,
        note: '',
        hasAccess: false,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCollaboratore(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCollaboratore) {
      updateMutation.mutate({ id: editingCollaboratore.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleToggleAttivo = (collaboratore: Collaboratore) => {
    updateMutation.mutate({
      id: collaboratore.id,
      data: { attivo: !collaboratore.attivo },
    });
  };

  if (isLoading) {
    return <div className="p-4">Caricamento collaboratori...</div>;
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">👥 Collaboratori</h2>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="w-4 h-4 mr-2" />
          Nuovo Collaboratore
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Ruolo</TableHead>
              <TableHead>Contatti</TableHead>
              <TableHead>Tariffe</TableHead>
              <TableHead>Accesso Dashboard</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {collaboratori.map((collab) => (
              <TableRow key={collab.id}>
                <TableCell className="font-medium">
                  {collab.cognome} {collab.nome}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {RUOLI_LABELS[collab.ruolo]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-1">
                      <Mail className="w-3 h-3" />
                      {collab.email}
                    </div>
                    {collab.cellulare && (
                      <div>📱 {collab.cellulare}</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="text-sm space-y-1">
                    {collab.tariffaOraria && (
                      <div>⏰ €{collab.tariffaOraria}/h</div>
                    )}
                    {collab.tariffaGiornaliera && (
                      <div>📅 €{collab.tariffaGiornaliera}/gg</div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {collab.hasAccess ? (
                    <Badge variant="default">✅ Abilitato</Badge>
                  ) : (
                    <Badge variant="secondary">❌ Non abilitato</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={collab.attivo}
                    onCheckedChange={() => handleToggleAttivo(collab)}
                  />
                  <span className="ml-2 text-sm">
                    {collab.attivo ? 'Attivo' : 'Inattivo'}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenModal(collab)}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingCollaboratore ? 'Modifica Collaboratore' : 'Nuovo Collaboratore'}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) =>
                    setFormData({ ...formData, nome: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="cognome">Cognome *</Label>
                <Input
                  id="cognome"
                  value={formData.cognome}
                  onChange={(e) =>
                    setFormData({ ...formData, cognome: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
              </div>

              <div>
                <Label htmlFor="cellulare">Cellulare</Label>
                <Input
                  id="cellulare"
                  value={formData.cellulare}
                  onChange={(e) =>
                    setFormData({ ...formData, cellulare: e.target.value })
                  }
                />
              </div>

              <div>
                <Label htmlFor="ruolo">Ruolo *</Label>
                <Select
                  value={formData.ruolo}
                  onValueChange={(value: CollaboratoreRole) =>
                    setFormData({ ...formData, ruolo: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RUOLI_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="tariffaOraria">Tariffa Oraria (€)</Label>
                <Input
                  id="tariffaOraria"
                  type="number"
                  step="0.01"
                  value={formData.tariffaOraria || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tariffaOraria: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="tariffaGiornaliera">Tariffa Giornaliera (€)</Label>
                <Input
                  id="tariffaGiornaliera"
                  type="number"
                  step="0.01"
                  value={formData.tariffaGiornaliera || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      tariffaGiornaliera: e.target.value ? parseFloat(e.target.value) : undefined,
                    })
                  }
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="hasAccess"
                  checked={formData.hasAccess}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, hasAccess: checked })
                  }
                />
                <Label htmlFor="hasAccess">Abilita Accesso Dashboard</Label>
              </div>
            </div>

            <div>
              <Label htmlFor="note">Note</Label>
              <RichTextEditor
                value={formData.note}
                onChange={(value) =>
                  setFormData({ ...formData, note: value })
                }
                placeholder="Inserisci note sul collaboratore..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCloseModal}>
                Annulla
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingCollaboratore ? 'Aggiorna' : 'Crea'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

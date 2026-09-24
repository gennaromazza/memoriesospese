import { useState } from 'react';
import { useLocation } from 'wouter';
import { useCreateGallery, useClients, useJobs } from '../../lib/api-hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function NewGallery() {
  const [, setLocation] = useLocation();
  const create = useCreateGallery();
  const { data: clients = [] } = useClients();
  const { data: jobs = [] } = useJobs();
  
  const [formData, setFormData] = useState({
    name: '',
    eventDate: '',
    location: '',
    description: ''
    ,clientId: ''
    ,jobId: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(
      { ...formData, clientIds: formData.clientId ? [formData.clientId] : [], status: 'draft', archived: false, passwordEnabled: false, pinEnabled: false, photoCount: 0, chapterCount: 0 },
      {
        onSuccess: (newGallery) => {
          setLocation(`/galleries/${newGallery.id}`);
        }
      }
    );
  };

  return (
    <div className="flex-1 overflow-y-auto bg-off-white p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-semibold text-foreground">Crea Galleria</h1>
          <p className="text-muted-foreground mt-1">Imposta un nuovo spazio di lavoro per organizzare e consegnare foto.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl shadow-sm p-8 space-y-6">
          {create.isError && (
            <div className="p-4 rounded-md bg-destructive/10 text-destructive text-sm font-medium">
              Errore nella creazione della galleria. Riprova.
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Nome Galleria *</Label>
            <Input 
              id="name" 
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="es. Matrimonio Marco e Giulia"
              className="text-lg py-6"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientId">Cliente</Label>
            <select id="clientId" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.clientId} onChange={e => setFormData({ ...formData, clientId: e.target.value })}>
              <option value="">Nessun cliente</option>
              {clients.map((client: any) => <option key={client.id} value={client.id}>{client.name || client.nome || client.email || client.id}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobId">Job</Label>
            <select id="jobId" className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.jobId} onChange={e => setFormData({ ...formData, jobId: e.target.value })}>
              <option value="">Nessun job</option>
              {jobs.map((job: any) => <option key={job.id} value={job.id}>{job.title || job.name || job.id}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="eventDate">Data Evento</Label>
              <Input 
                id="eventDate" 
                type="date"
                value={formData.eventDate}
                onChange={e => setFormData({ ...formData, eventDate: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="location">Luogo</Label>
              <Input 
                id="location" 
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                placeholder="es. Villa d'Este, Tivoli"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrizione (Opzionale)</Label>
            <Textarea 
              id="description" 
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              placeholder="Note interne o descrizione pubblica..."
              rows={4}
            />
          </div>

          <div className="pt-6 flex items-center justify-end gap-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setLocation('/')}>Annulla</Button>
            <Button type="submit" disabled={create.isPending || !formData.name}>
              {create.isPending ? 'Creazione in corso...' : 'Crea Galleria'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

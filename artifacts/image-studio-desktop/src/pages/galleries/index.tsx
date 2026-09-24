import { useState } from 'react';
import { useClients, useGalleries, useJobs } from '../../lib/api-hooks';
import { clientLabel, jobLabel } from '../../lib/gallery-associations';
import { Link } from 'wouter';
import { Plus, Search, MapPin, Calendar, Camera } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function GalleriesList() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  
  const { data: galleries, isLoading, error } = useGalleries(search, status);
  const { data: clients = [] } = useClients();
  const { data: jobs = [] } = useJobs();

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-off-white">
      <div className="flex-none p-8 pb-4 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-serif font-semibold text-foreground">Gallerie</h1>
            <p className="text-muted-foreground mt-1">Gestisci gallerie fotografiche e selezioni clienti.</p>
          </div>
          <Link href="/galleries/new" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
            <Plus className="w-4 h-4 mr-2" />
            Nuova Galleria
          </Link>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Cerca gallerie o clienti..." 
              className="pl-9 bg-background"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="">Tutti gli stati</option>
            <option value="draft">Bozza</option>
            <option value="published">Pubblicata</option>
            <option value="archived">Archiviata</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">Caricamento gallerie...</div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-destructive">Errore nel caricamento delle gallerie.</div>
        ) : galleries?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Camera className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <p>Nessuna galleria trovata.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {galleries?.map(gallery => (
              <Link key={gallery.id} href={`/galleries/${gallery.id}`} className="group block h-full">
                <div className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-md transition-all duration-200 hover:border-primary/30 h-full flex flex-col">
                  <div className="aspect-[4/3] bg-muted relative overflow-hidden flex-none">
                    {gallery.coverUrl ? (
                      <img src={gallery.coverUrl} alt={gallery.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Camera className="w-8 h-8 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute top-3 right-3 flex gap-2">
                      <Badge variant={gallery.status === 'published' ? 'default' : 'secondary'} className="shadow-sm">
                        {gallery.status}
                      </Badge>
                      {gallery.selectionMode && (
                        <Badge variant="outline" className="bg-background/80 backdrop-blur-sm shadow-sm">
                          Selezione
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <h3 className="font-serif font-semibold text-lg text-foreground line-clamp-1 mb-1 group-hover:text-primary transition-colors">
                      {gallery.name}
                    </h3>
                    
                    <div className="space-y-2 mt-3 text-sm text-muted-foreground flex-1">
                      {gallery.jobId && (
                        <p className="truncate">Job: {jobLabel(jobs.find(job => job.id === gallery.jobId) || { id: gallery.jobId })}</p>
                      )}
                      {gallery.eventDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          <span>{new Date(gallery.eventDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {gallery.location && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          <span className="line-clamp-1">{gallery.location}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm text-foreground">
                      <span className="font-medium">{gallery.photoCount || 0} foto</span>
                      <span className="text-muted-foreground truncate max-w-[120px]">
                        {gallery.clientIds?.map(id => {
                          const client = clients.find(item => item.id === id);
                          return client ? clientLabel(client) : id;
                        }).join(', ') || gallery.clientNames?.join(', ') || 'Nessun cliente'}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

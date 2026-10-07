import { useState } from 'react';
import {
  Briefcase,
  Calendar,
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  Globe,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import './_group.css';

const groups = [
  { id: 'agenda', label: 'Agenda', icon: Calendar, menu: ['Calendario', 'Lista Prenotazioni', 'Campagne'] },
  { id: 'lavori', label: 'Lavori & Clienti', icon: Briefcase, menu: ['Lista Lavori', 'Clienti', 'Tipi di Lavoro', 'Laboratori', 'Clausole Contrattuali', 'Template Preventivi', 'Moduli Informativi'] },
  { id: 'gallerie', label: 'Gallerie', icon: Eye, menu: ['Gallerie Eventi', 'Fotolibri', 'Questionari'] },
  { id: 'comunicazione', label: 'Comunicazione & Sito', icon: Globe, menu: ['Sito Pubblico – Portfolio', 'Sito Pubblico – Blog', 'Video'] },
  { id: 'cassa', label: 'Cassa', icon: Wallet },
  { id: 'stampe-online', label: 'Stampe online', icon: Printer },
  { id: 'impostazioni', label: 'Impostazioni', icon: Settings, menu: ['Impostazioni Studio', 'Collaboratori', 'Catalogo Prodotti'] },
  { id: 'assistente', label: 'Assistente', icon: Sparkles },
];

const jobSections = [
  { id: 'jobs-list', label: 'Lista Lavori' },
  { id: 'clienti', label: 'Clienti' },
  { id: 'job-types', label: 'Tipi di Lavoro' },
  { id: 'laboratori', label: 'Laboratori' },
  { id: 'contract-clauses', label: 'Clausole Contrattuali' },
  { id: 'quote-templates', label: 'Template Preventivi' },
  { id: 'moduli-informativi', label: 'Moduli Informativi' },
];

export function Current() {
  const [activeGroup, setActiveGroup] = useState('lavori');
  const [activeSection, setActiveSection] = useState('jobs-list');

  return (
    <div className="admin-mobile-preview min-h-screen bg-background text-foreground">
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="mb-4 sm:mb-6 flex flex-wrap justify-start gap-0.5 sm:gap-1 h-auto p-1 bg-muted rounded-lg overflow-x-auto touch-manipulation">
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const isActive = group.id === activeGroup;
            const triggerClasses = 'flex-shrink-0 px-1.5 py-1.5 sm:px-2 sm:py-1.5 text-[10px] sm:text-xs md:text-sm md:px-3 md:py-2 whitespace-nowrap flex items-center gap-1 sm:gap-2 min-h-[36px] sm:min-h-[40px]';

            if (!group.menu) {
              return (
                <Button
                  key={group.id}
                  variant={isActive ? 'default' : 'ghost'}
                  className={triggerClasses}
                  onClick={() => setActiveGroup(group.id)}
                >
                  <GroupIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                  <span>{group.label}</span>
                </Button>
              );
            }

            return (
              <DropdownMenu key={group.id}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    className={triggerClasses}
                    aria-label={`${group.label}, apri menu`}
                  >
                    <GroupIcon className="h-3 w-3 sm:h-3.5 sm:w-3.5 md:h-4 md:w-4 flex-shrink-0" />
                    <span>{group.label}</span>
                    <ChevronDown className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-0.5 sm:ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60">
                  {group.menu.map((item) => (
                    <DropdownMenuItem key={item} onSelect={() => setActiveGroup(group.id)}>
                      {item}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}
        </div>

        <Tabs value={activeSection} onValueChange={setActiveSection}>
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-7 gap-1 mb-4">
            <TabsTrigger value="jobs-list">Lista Lavori</TabsTrigger>
            <TabsTrigger value="clienti">Clienti</TabsTrigger>
            <TabsTrigger value="job-types">Tipi di Lavoro</TabsTrigger>
            <TabsTrigger value="laboratori">Laboratori</TabsTrigger>
            <TabsTrigger value="contract-clauses">Clausole Contrattuali</TabsTrigger>
            <TabsTrigger value="quote-templates">
              <FileText className="w-4 h-4 mr-2" />
              Template Preventivi
            </TabsTrigger>
            <TabsTrigger value="moduli-informativi">
              <ClipboardList className="w-4 h-4 mr-1.5" />
              Moduli Informativi
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeSection}>
            <div className="bg-white shadow sm:rounded-lg p-5">
              <div className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-3xl font-serif font-bold text-foreground">
                      Gestione Lavori
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                      246 lavori caricati · 35 visualizzati
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline">
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Aggiorna
                    </Button>
                    <Button
                      style={{
                        backgroundColor: 'hsl(var(--sage))',
                        color: 'hsl(var(--off-white))',
                      }}
                      className="hover:brightness-95"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuovo Lavoro
                    </Button>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-amber-200 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-amber-900 text-sm">
                        18 richieste da Preventivo Rapido da gestire
                      </p>
                      <p className="text-xs text-amber-800/80">
                        Clienti in attesa di una risposta.
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full sm:w-auto shrink-0 border-amber-400 text-amber-800"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Mostra Preventivi Rapidi
                  </Button>
                </div>

                <div className="flex items-center justify-end">
                  <Button variant="ghost" size="sm" className="text-muted-foreground">
                    <Eye className="w-4 h-4 mr-2" />
                    Mostra statistiche
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <div className="sr-only" aria-live="polite">
          Sezione selezionata: {jobSections.find((section) => section.id === activeSection)?.label}
        </div>
      </main>
    </div>
  );
}
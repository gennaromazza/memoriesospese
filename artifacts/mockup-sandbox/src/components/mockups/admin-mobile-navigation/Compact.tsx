import { useState } from 'react';
import {
  Briefcase,
  Calendar,
  Eye,
  Globe,
  Plus,
  Printer,
  RefreshCw,
  Settings,
  Users,
  Wallet,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import './_group.css';

const areas = [
  {
    id: 'agenda',
    label: 'Agenda',
    icon: Calendar,
    sections: [
      { id: 'calendario', label: 'Calendario' },
      { id: 'bookings', label: 'Lista Prenotazioni' },
      { id: 'campaigns', label: 'Campagne' },
      { id: 'consulenze', label: 'Richieste Info' },
      { id: 'consulenze-templates', label: 'Template Richieste' },
      { id: 'follow-up', label: 'Centro Follow-up' },
    ],
  },
  {
    id: 'lavori',
    label: 'Lavori & Clienti',
    icon: Briefcase,
    sections: [
      { id: 'jobs-list', label: 'Lista Lavori' },
      { id: 'clienti', label: 'Clienti' },
      { id: 'job-types', label: 'Tipi di Lavoro' },
      { id: 'laboratori', label: 'Laboratori' },
      { id: 'contract-clauses', label: 'Clausole Contrattuali' },
      { id: 'quote-templates', label: 'Template Preventivi' },
      { id: 'moduli-informativi', label: 'Moduli Informativi' },
    ],
  },
  {
    id: 'gallerie',
    label: 'Gallerie',
    icon: Eye,
    sections: [
      { id: 'galleries', label: 'Gallerie Eventi' },
      { id: 'photobooks', label: 'Fotolibri' },
      { id: 'photobook-changes', label: 'Modifiche Fotolibro' },
      { id: 'questionnaire', label: 'Questionari' },
      { id: 'requests', label: 'Richieste Password' },
      { id: 'themes', label: 'Temi Stagionali' },
    ],
  },
  {
    id: 'comunicazione',
    label: 'Comunicazione & Sito',
    icon: Globe,
    sections: [
      { id: 'portfolio', label: 'Sito Pubblico – Portfolio' },
      { id: 'blog', label: 'Sito Pubblico – Blog' },
      { id: 'videos', label: 'Video' },
      { id: 'bulkEmail', label: 'Email Massivo' },
      { id: 'email-logs', label: 'Storico Email' },
    ],
  },
  { id: 'cassa', label: 'Cassa', icon: Wallet, sections: [{ id: 'cassa', label: 'Cassa' }] },
  { id: 'stampe-online', label: 'Stampe online', icon: Printer, sections: [{ id: 'print-shop-orders', label: 'Stampe online' }] },
  {
    id: 'impostazioni',
    label: 'Impostazioni',
    icon: Settings,
    sections: [
      { id: 'studio', label: 'Impostazioni Studio' },
      { id: 'slideshow', label: 'Slideshow Homepage' },
      { id: 'integrations', label: 'Integrazioni' },
      { id: 'collaboratori', label: 'Collaboratori' },
      { id: 'products', label: 'Catalogo Prodotti' },
      { id: 'product-categories', label: 'Categorie Prodotti' },
      { id: 'product-stats', label: 'Statistiche Prodotti' },
      { id: 'migration', label: 'Migrazione Foto Legacy' },
      { id: 'audit', label: 'Audit Sistema' },
      { id: 'backup', label: 'Gestione Backup' },
      { id: 'phone-migration', label: 'Migrazione Telefoni' },
    ],
  },
];

export function Compact() {
  const [activeArea, setActiveArea] = useState('lavori');
  const [activeSection, setActiveSection] = useState('jobs-list');
  const selectedArea = areas.find((area) => area.id === activeArea) ?? areas[1];
  const AreaIcon = selectedArea.icon;

  return (
    <div className="admin-mobile-preview min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-2xl px-4 pt-4 pb-10 sm:px-6">
        <nav aria-label="Navigazione amministrazione" className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Area
              </p>
              <Select
                value={activeArea}
                onValueChange={(value) => {
                  setActiveArea(value);
                  const nextArea = areas.find((area) => area.id === value);
                  if (nextArea) setActiveSection(nextArea.sections[0].id);
                }}
              >
                <SelectTrigger aria-label="Area amministrativa" className="h-11 w-full rounded-lg bg-background px-2.5 text-xs font-semibold">
                  <AreaIcon className="mr-1.5 h-4 w-4 shrink-0 text-primary" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start">
                  {areas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-0">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Sezione
              </p>
              <Select value={activeSection} onValueChange={setActiveSection}>
                <SelectTrigger aria-label={`Sezione ${selectedArea.label}`} className="h-11 w-full rounded-lg bg-background px-2.5 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end">
                  {selectedArea.sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </nav>

        <section aria-labelledby="jobs-heading" className="mt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Lavori &amp; Clienti
              </p>
              <h1 id="jobs-heading" className="mt-1 font-serif text-[26px] font-semibold leading-tight text-foreground">
                Gestione Lavori
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                246 lavori caricati <span aria-hidden="true">·</span> 35 visualizzati
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-[44px_1fr] gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Aggiorna lavori"
              className="h-11 w-11 rounded-lg bg-card"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              style={{
                backgroundColor: 'hsl(var(--sage))',
                color: 'hsl(var(--off-white))',
              }}
              className="h-11 rounded-lg font-semibold hover:brightness-95"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nuovo Lavoro
            </Button>
          </div>

          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-800">
                <Zap className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-amber-50 bg-amber-700 px-1 text-[10px] font-bold text-white">
                  18
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-amber-950">
                  Preventivi Rapidi
                </p>
                <p className="mt-1 text-xs leading-snug text-amber-900/80">
                  Richieste in attesa di risposta
                </p>
              </div>
              <Button
                variant="outline"
                size="icon"
                aria-label="Mostra Preventivi Rapidi"
                className="h-10 w-10 shrink-0 rounded-lg border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </Button>
            </div>
          </div>

          <Button variant="ghost" className="mt-3 h-10 w-full justify-start rounded-lg px-2 text-sm text-muted-foreground">
            <Eye className="mr-2 h-4 w-4" />
            Mostra statistiche
          </Button>

          <div className="mt-5 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">Lavori recenti</p>
                <p className="mt-1 text-xs text-muted-foreground">Apri un lavoro per vedere i dettagli.</p>
              </div>
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
              <span>Ultimi aggiornati</span>
              <span>35 risultati</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
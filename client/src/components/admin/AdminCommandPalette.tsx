import { useState, useEffect, useCallback } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Calendar,
  Eye,
  HelpCircle,
  Sparkles,
  Key,
  CalendarCheck,
  Briefcase,
  Wallet,
  Settings,
  Play,
  Package,
  FolderOpen,
  Users,
  Mail,
  Globe,
  FileText,
  Grid3x3,
  BookOpen,
  Image,
  ShoppingBag,
  Clock,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminSection {
  id: string;
  label: string;
  icon: any;
  tab: string;
  subTab?: string;
  settingsSection?: string;
  consultationSection?: string;
  bookingSection?: string;
  jobSection?: string;
  sitoSection?: string;
  group: string;
}

const adminSections: AdminSection[] = [
  { id: "calendario", label: "Calendario", icon: Calendar, tab: "calendario", group: "Principale" },
  
  { id: "galleries", label: "Gallerie Eventi", icon: Eye, tab: "galleries", group: "Gallerie" },
  { id: "questionnaire", label: "Questionari", icon: HelpCircle, tab: "questionnaire", group: "Gallerie" },
  { id: "themes", label: "Temi Stagionali", icon: Sparkles, tab: "themes", group: "Gallerie" },
  { id: "requests", label: "Richieste Password", icon: Key, tab: "requests", group: "Gallerie" },
  
  { id: "bookings-list", label: "Prenotazioni - Lista", icon: CalendarCheck, tab: "bookings", bookingSection: "bookings-list", group: "Prenotazioni" },
  { id: "campaigns", label: "Prenotazioni - Campagne", icon: Calendar, tab: "bookings", bookingSection: "campaigns", group: "Prenotazioni" },
  { id: "orders", label: "Prenotazioni - Ordini", icon: ShoppingBag, tab: "bookings", bookingSection: "orders", group: "Prenotazioni" },
  
  { id: "jobs-list", label: "Lavori - Lista", icon: Briefcase, tab: "lavori", jobSection: "jobs-list", group: "Lavori" },
  { id: "clienti", label: "Lavori - Clienti", icon: Users, tab: "lavori", jobSection: "clienti", group: "Lavori" },
  { id: "job-types", label: "Lavori - Tipi Lavoro", icon: Grid3x3, tab: "lavori", jobSection: "job-types", group: "Lavori" },
  { id: "contract-clauses", label: "Lavori - Clausole Contratto", icon: FileText, tab: "lavori", jobSection: "contract-clauses", group: "Lavori" },
  { id: "quote-templates", label: "Lavori - Template Preventivi", icon: FileText, tab: "lavori", jobSection: "quote-templates", group: "Lavori" },
  
  { id: "cassa", label: "Cassa", icon: Wallet, tab: "cassa", group: "Finanza" },
  
  { id: "consulenze", label: "Richieste Info - Lista", icon: CalendarCheck, tab: "consulenze", consultationSection: "consulenze", group: "Consulenze" },
  { id: "consulenze-templates", label: "Richieste Info - Template", icon: FileText, tab: "consulenze", consultationSection: "consulenze-templates", group: "Consulenze" },
  
  { id: "studio", label: "Impostazioni Studio", icon: Settings, tab: "settings", settingsSection: "studio", group: "Impostazioni" },
  { id: "slideshow", label: "Slideshow Homepage", icon: Play, tab: "settings", settingsSection: "slideshow", group: "Impostazioni" },
  { id: "products", label: "Catalogo Prodotti", icon: Package, tab: "settings", settingsSection: "products", group: "Impostazioni" },
  { id: "product-categories", label: "Categorie Prodotti", icon: FolderOpen, tab: "settings", settingsSection: "product-categories", group: "Impostazioni" },
  { id: "migration", label: "Migrazione Foto Legacy", icon: Image, tab: "settings", settingsSection: "migration", group: "Impostazioni" },
  
  { id: "collaboratori", label: "Collaboratori", icon: Users, tab: "collaboratori", group: "Team" },
  { id: "bulkEmail", label: "Email Massivo", icon: Mail, tab: "bulkEmail", group: "Marketing" },
  
  { id: "portfolio", label: "Sito Pubblico - Portfolio", icon: Image, tab: "sitoPublico", sitoSection: "portfolio", group: "Sito Pubblico" },
  { id: "blog", label: "Sito Pubblico - Blog", icon: BookOpen, tab: "sitoPublico", sitoSection: "blog", group: "Sito Pubblico" },
  
  { id: "videos", label: "Video Wedding", icon: Play, tab: "videos", group: "Contenuti" },
];

interface AdminCommandPaletteProps {
  onNavigate: (
    tab: string,
    options?: {
      settingsSection?: string;
      consultationSection?: string;
      bookingSection?: string;
      jobSection?: string;
      sitoSection?: string;
    }
  ) => void;
}

export function AdminCommandPalette({ onNavigate }: AdminCommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback(
    (section: AdminSection) => {
      onNavigate(section.tab, {
        settingsSection: section.settingsSection,
        consultationSection: section.consultationSection,
        bookingSection: section.bookingSection,
        jobSection: section.jobSection,
        sitoSection: section.sitoSection,
      });
      setOpen(false);
    },
    [onNavigate]
  );

  const groups = [...new Set(adminSections.map((s) => s.group))];

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="relative h-9 w-9 p-0 xl:h-10 xl:w-60 xl:justify-start xl:px-3 xl:py-2"
        onClick={() => setOpen(true)}
        data-testid="admin-search-button"
      >
        <Search className="h-4 w-4 xl:mr-2" />
        <span className="hidden xl:inline-flex">Cerca sezione...</span>
        <kbd className="pointer-events-none absolute right-1.5 top-2 hidden h-6 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 xl:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Cerca una sezione del pannello..." />
        <CommandList>
          <CommandEmpty>Nessuna sezione trovata.</CommandEmpty>
          {groups.map((group, index) => (
            <div key={group}>
              {index > 0 && <CommandSeparator />}
              <CommandGroup heading={group}>
                {adminSections
                  .filter((s) => s.group === group)
                  .map((section) => {
                    const Icon = section.icon;
                    return (
                      <CommandItem
                        key={section.id}
                        value={`${section.label} ${section.group}`}
                        onSelect={() => handleSelect(section)}
                        className="cursor-pointer"
                        data-testid={`command-item-${section.id}`}
                      >
                        <Icon className="mr-2 h-4 w-4" />
                        <span>{section.label}</span>
                      </CommandItem>
                    );
                  })}
              </CommandGroup>
            </div>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

export default AdminCommandPalette;

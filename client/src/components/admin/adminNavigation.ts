import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  CalendarCheck,
  Sparkles,
  Briefcase,
  Users,
  Grid3x3,
  FlaskConical,
  ScrollText,
  FileText,
  ClipboardList,
  Eye,
  HelpCircle,
  Key,
  Globe,
  Image,
  BookOpen,
  Play,
  Mail,
  Wallet,
  Settings,
  Link2,
  Package,
  FolderOpen,
  BarChart3,
  BookImage,
  RefreshCw,
  Search,
  HardDrive,
  Phone,
} from "lucide-react";

/**
 * Destinazione di una voce di navigazione del pannello admin.
 * - tab + eventuale sezione: naviga internamente al dashboard
 * - href: naviga a una route separata (newTab = apre in nuova scheda)
 */
export interface NavTarget {
  tab?: string;
  jobSection?: string;
  bookingSection?: string;
  consultationSection?: string;
  settingsSection?: string;
  sitoSection?: string;
  href?: string;
  newTab?: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  target: NavTarget;
  /** Etichetta di sezione mostrata sopra questa voce nel dropdown */
  sectionLabel?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Se presente, il gruppo è un dropdown con queste voci */
  items?: NavItem[];
  /** Se presente (e items assente), il gruppo è una voce diretta */
  target?: NavTarget;
  /** Valori di activeTab che rendono attivo questo gruppo */
  tabs: string[];
}

/**
 * Mappa di navigazione unica del pannello admin.
 * Alimenta sia la barra menu (AdminDashboard) sia la Command Palette (Ctrl+K).
 * I valori tab/section corrispondono agli stati esistenti: NON rinominarli
 * senza aggiungere un mapping di compatibilità per sessionStorage e deep-link.
 */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    id: "agenda",
    label: "Agenda",
    icon: Calendar,
    tabs: ["calendario", "bookings", "consulenze", "consulenze-templates"],
    items: [
      {
        id: "calendario",
        label: "Calendario",
        icon: Calendar,
        target: { tab: "calendario" },
      },
      {
        id: "bookings-list",
        label: "Lista Prenotazioni",
        icon: CalendarCheck,
        target: { tab: "bookings", bookingSection: "bookings-list" },
        sectionLabel: "Prenotazioni",
      },
      {
        id: "campaigns",
        label: "Campagne",
        icon: Calendar,
        target: { tab: "bookings", bookingSection: "campaigns" },
      },
      {
        id: "consulenze",
        label: "Richieste Info",
        icon: CalendarCheck,
        target: { tab: "consulenze", consultationSection: "consulenze" },
        sectionLabel: "Richieste Info",
      },
      {
        id: "consulenze-templates",
        label: "Template Richieste",
        icon: FileText,
        target: {
          tab: "consulenze",
          consultationSection: "consulenze-templates",
        },
      },
    ],
  },
  {
    id: "lavori",
    label: "Lavori & Clienti",
    icon: Briefcase,
    tabs: ["lavori"],
    items: [
      {
        id: "jobs-list",
        label: "Lista Lavori",
        icon: Briefcase,
        target: { tab: "lavori", jobSection: "jobs-list" },
      },
      {
        id: "clienti",
        label: "Clienti",
        icon: Users,
        target: { tab: "lavori", jobSection: "clienti" },
      },
      {
        id: "job-types",
        label: "Tipi di Lavoro",
        icon: Grid3x3,
        target: { tab: "lavori", jobSection: "job-types" },
      },
      {
        id: "laboratori",
        label: "Laboratori",
        icon: FlaskConical,
        target: { tab: "lavori", jobSection: "laboratori" },
      },
      {
        id: "contract-clauses",
        label: "Clausole Contrattuali",
        icon: ScrollText,
        target: { tab: "lavori", jobSection: "contract-clauses" },
      },
      {
        id: "quote-templates",
        label: "Template Preventivi",
        icon: FileText,
        target: { tab: "lavori", jobSection: "quote-templates" },
      },
      {
        id: "moduli-informativi",
        label: "Moduli Informativi",
        icon: ClipboardList,
        target: { tab: "lavori", jobSection: "moduli-informativi" },
      },
    ],
  },
  {
    id: "gallerie",
    label: "Gallerie",
    icon: Eye,
    tabs: ["galleries", "questionnaire", "themes", "requests", "photobooks", "photobook-changes"],
    items: [
      {
        id: "galleries",
        label: "Gallerie Eventi",
        icon: Eye,
        target: { tab: "galleries" },
      },
      {
        id: "photobooks",
        label: "Fotolibri",
        icon: BookImage,
        target: { tab: "photobooks" },
        sectionLabel: "Fotolibri",
      },
      {
        id: "photobook-changes",
        label: "Modifiche Fotolibro",
        icon: ClipboardList,
        target: { tab: "photobook-changes" },
      },
      {
        id: "questionnaire",
        label: "Questionari",
        icon: HelpCircle,
        target: { tab: "questionnaire" },
      },
      {
        id: "requests",
        label: "Richieste Password",
        icon: Key,
        target: { tab: "requests" },
      },
      {
        id: "themes",
        label: "Temi Stagionali",
        icon: Sparkles,
        target: { tab: "themes" },
      },
    ],
  },
  {
    id: "comunicazione",
    label: "Comunicazione & Sito",
    icon: Globe,
    tabs: ["sitoPublico", "videos", "bulkEmail"],
    items: [
      {
        id: "portfolio",
        label: "Sito Pubblico – Portfolio",
        icon: Image,
        target: { tab: "sitoPublico", sitoSection: "portfolio" },
      },
      {
        id: "blog",
        label: "Sito Pubblico – Blog",
        icon: BookOpen,
        target: { tab: "sitoPublico", sitoSection: "blog" },
      },
      {
        id: "videos",
        label: "Video",
        icon: Play,
        target: { tab: "videos" },
      },
      {
        id: "bulkEmail",
        label: "Email Massivo",
        icon: Mail,
        target: { tab: "bulkEmail" },
        sectionLabel: "Email",
      },
      {
        id: "email-logs",
        label: "Storico Email",
        icon: Mail,
        target: { tab: "settings", settingsSection: "email-logs" },
      },
    ],
  },
  {
    id: "cassa",
    label: "Cassa",
    icon: Wallet,
    tabs: ["cassa"],
    target: { tab: "cassa" },
  },
  {
    id: "impostazioni",
    label: "Impostazioni",
    icon: Settings,
    tabs: ["settings", "collaboratori"],
    items: [
      {
        id: "studio",
        label: "Impostazioni Studio",
        icon: Settings,
        target: { tab: "settings", settingsSection: "studio" },
        sectionLabel: "Configurazione",
      },
      {
        id: "slideshow",
        label: "Slideshow Homepage",
        icon: Play,
        target: { tab: "settings", settingsSection: "slideshow" },
      },
      {
        id: "integrations",
        label: "Integrazioni",
        icon: Link2,
        target: { tab: "settings", settingsSection: "integrations" },
      },
      {
        id: "collaboratori",
        label: "Collaboratori",
        icon: Users,
        target: { tab: "collaboratori" },
      },
      {
        id: "products",
        label: "Catalogo Prodotti",
        icon: Package,
        target: { tab: "settings", settingsSection: "products" },
        sectionLabel: "Catalogo",
      },
      {
        id: "product-categories",
        label: "Categorie Prodotti",
        icon: FolderOpen,
        target: { tab: "settings", settingsSection: "product-categories" },
      },
      {
        id: "product-stats",
        label: "Statistiche Prodotti",
        icon: BarChart3,
        target: { href: "/admin/product-stats" },
      },
      {
        id: "migration",
        label: "Migrazione Foto Legacy",
        icon: RefreshCw,
        target: { tab: "settings", settingsSection: "migration" },
        sectionLabel: "Strumenti",
      },
      {
        id: "audit",
        label: "Audit Sistema",
        icon: Search,
        target: { href: "/admin/audit", newTab: true },
      },
      {
        id: "backup",
        label: "Gestione Backup",
        icon: HardDrive,
        target: { href: "/admin/backup", newTab: true },
      },
      {
        id: "phone-migration",
        label: "Migrazione Telefoni",
        icon: Phone,
        target: { href: "/admin/phone-migration", newTab: true },
      },
    ],
  },
  {
    id: "assistente",
    label: "Assistente",
    icon: Sparkles,
    tabs: ["assistente"],
    target: { tab: "assistente" },
  },
];

/** Voce piatta per la Command Palette, derivata dalla mappa di navigazione */
export interface FlatNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  target: NavTarget;
  group: string;
}

export function getFlatNavItems(): FlatNavItem[] {
  const items: FlatNavItem[] = [];
  for (const group of ADMIN_NAV_GROUPS) {
    if (group.items) {
      for (const item of group.items) {
        items.push({
          id: item.id,
          label: item.label,
          icon: item.icon,
          target: item.target,
          group: group.label,
        });
      }
    } else if (group.target) {
      items.push({
        id: group.id,
        label: group.label,
        icon: group.icon,
        target: group.target,
        group: group.label,
      });
    }
  }
  return items;
}

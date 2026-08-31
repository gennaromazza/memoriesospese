import {
  BookOpen,
  CalendarDays,
  Camera,
  Clapperboard,
  Image,
  MapPin,
  Phone,
  Printer,
  Sparkles,
  Star,
} from 'lucide-react';

export interface NavItem {
  label: string;
  href: string;
  icon?: any;
  external?: boolean;
  showInHeader?: boolean;
  showInFooter?: boolean;
  showInMobile?: boolean;
  mobileOrder?: number;
  highlight?: boolean;
}

export interface SocialLink {
  name: string;
  href: string;
  icon: 'facebook' | 'instagram' | 'twitter' | 'google';
}

export interface DiscoverNavItem extends NavItem {
  description: string;
}

export interface DiscoverNavGroup {
  label: string;
  items: DiscoverNavItem[];
}

export const mainNavItems: NavItem[] = [
  {
    label: 'Portfolio',
    href: '/portfolio',
    icon: Camera,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 1,
  },
  {
    label: 'Blog',
    href: '/blog',
    icon: BookOpen,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 2,
  },
  {
    label: 'Recensioni',
    href: '/#recensioni',
    icon: Star,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 3,
  },
  {
    label: 'Prenota una chiamata',
    href: '/consulenze',
    icon: Phone,
    showInHeader: true,
    showInFooter: false,
    showInMobile: true,
    mobileOrder: 4,
    highlight: true,
  },
];

/**
 * Pagine pubbliche utili ma troppo numerose per la navigazione principale.
 * Sono raccolte in un unico menu editoriale, disponibile sia desktop sia mobile.
 */
export const discoverNavGroups: DiscoverNavGroup[] = [
  {
    label: 'Il nostro mondo',
    items: [
      {
        label: 'Gennaro e Image Studio',
        href: '/storie',
        icon: Sparkles,
        description: 'La storia, le persone e i valori dietro ogni fotografia.',
        showInFooter: true,
      },
      {
        label: 'Il libro · Lasciati Trasportare',
        href: '/lasciati-trasportare',
        icon: BookOpen,
        description: 'Anteprima e download del libro di Gennaro Mazzacane.',
        showInFooter: true,
      },
      {
        label: 'Lo studio ad Aversa',
        href: '/fotografo-aversa',
        icon: MapPin,
        description: 'Dove siamo e come lavoriamo tra Aversa, Napoli e Caserta.',
        showInFooter: true,
      },
    ],
  },
  {
    label: 'Esperienze',
    items: [
      {
        label: 'Stampa le tue foto',
        href: '/stampa-foto-aversa',
        icon: Printer,
        description: 'Carica i JPG, configura, paga con PayPal e ritira in sede.',
        showInFooter: true,
      },
      {
        label: 'Vision',
        href: '/vision',
        icon: Clapperboard,
        description: 'Film e racconti di matrimonio da guardare e rivivere.',
        showInFooter: true,
      },
      {
        label: 'Sessioni fotografiche',
        href: '/prenota',
        icon: CalendarDays,
        description: 'Scopri le esperienze disponibili e scegli il tuo posto.',
        showInFooter: true,
      },
    ],
  },
  {
    label: 'Il tuo spazio',
    items: [
      {
        label: 'Accedi alla galleria',
        href: '/accesso-galleria',
        icon: Image,
        description: 'Apri la tua galleria privata e ritrova le fotografie.',
        showInFooter: true,
      },
      {
        label: 'Prenota una consulenza',
        href: '/consulenze',
        icon: Phone,
        description: 'Scegli quando sentirci e raccontaci cosa immagini.',
        showInFooter: true,
      },
    ],
  },
];

export const socialLinks: SocialLink[] = [
  {
    name: 'Facebook',
    href: 'https://www.facebook.com/gennaromazzacanefotografo/?locale=it_IT',
    icon: 'facebook',
  },
  {
    name: 'Google Reviews',
    href: 'https://share.google/SW1hp2vnc9Csiwfkc',
    icon: 'google',
  },
];

export const getHeaderItems = () => mainNavItems.filter(item => item.showInHeader);
export const getFooterItems = () => [
  ...mainNavItems.filter(item => item.showInFooter),
  ...discoverNavGroups.flatMap(group => group.items).filter(item => item.showInFooter),
];
export const getDiscoverGroups = () => discoverNavGroups;
export const getMobileItems = () =>
  mainNavItems
    .filter(item => item.showInMobile)
    .sort((a, b) => (a.mobileOrder || 99) - (b.mobileOrder || 99));

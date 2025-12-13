import { Home, Camera, BookOpen, Video, Mail, Calendar, Image } from 'lucide-react';

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

export const mainNavItems: NavItem[] = [
  {
    label: 'Home',
    href: '/',
    icon: Home,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 1,
  },
  {
    label: 'Portfolio',
    href: '/portfolio',
    icon: Camera,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 2,
  },
  {
    label: 'La Mia Storia',
    href: '/storie',
    icon: BookOpen,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 3,
  },
  {
    label: 'Blog',
    href: '/blog',
    icon: BookOpen,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 4,
  },
  {
    label: 'iMaGe Vision',
    href: '/vision',
    icon: Video,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 5,
  },
  {
    label: 'Contattami',
    href: '/consulenze',
    icon: Mail,
    showInHeader: true,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 6,
  },
  {
    label: 'Prenota Ora',
    href: '/prenota',
    icon: Calendar,
    showInHeader: true,
    showInFooter: false,
    showInMobile: true,
    mobileOrder: 7,
    highlight: true,
  },
  {
    label: 'Accedi alla Galleria',
    href: '/accesso-galleria',
    icon: Image,
    showInHeader: false,
    showInFooter: true,
    showInMobile: true,
    mobileOrder: 8,
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
export const getFooterItems = () => mainNavItems.filter(item => item.showInFooter);
export const getMobileItems = () => 
  mainNavItems
    .filter(item => item.showInMobile)
    .sort((a, b) => (a.mobileOrder || 99) - (b.mobileOrder || 99));

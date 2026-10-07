/**
 * Job Type Icons - Icone Lucide eleganti per tipi di lavoro
 * Sostituisce le emoji con icone professionali coerenti con la UI
 */

import {
  Camera,
  Heart,
  Baby,
  Church,
  Cake,
  Aperture,
  Users,
  Briefcase,
  GraduationCap,
  PartyPopper,
  Sparkles,
  Image,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Mapping slug -> icona Lucide
const JOB_TYPE_ICON_MAP: Record<string, LucideIcon> = {
  // Matrimonio e varianti
  'matrimonio': Heart,
  'wedding': Heart,
  'nozze': Heart,
  
  // Battesimo e varianti
  'battesimo': Baby,
  'baptism': Baby,
  
  // Comunione e varianti
  'comunione': Church,
  'communion': Church,
  'cresima': Church,
  'prima-comunione': Church,
  
  // Compleanno e varianti
  'compleanno': Cake,
  'primo-compleanno': Cake,
  'birthday': Cake,
  'festa': PartyPopper,
  
  // Shooting e varianti
  'shooting': Aperture,
  'portrait': Aperture,
  'ritratto': Aperture,
  'book': Aperture,
  
  // Corporate/Aziendale
  'corporate': Briefcase,
  'aziendale': Briefcase,
  'business': Briefcase,
  
  // Eventi speciali
  'laurea': GraduationCap,
  'graduation': GraduationCap,
  'evento': Sparkles,
  'event': Sparkles,
  
  // Famiglia
  'famiglia': Users,
  'family': Users,
  
  // Default
  'default': Camera
};

/**
 * Restituisce l'icona Lucide appropriata per un tipo di lavoro
 * @param slug - Lo slug del tipo di lavoro (es. 'matrimonio', 'battesimo')
 * @returns Il componente icona Lucide
 */
export function getJobTypeIcon(slug: string | undefined | null): LucideIcon {
  if (!slug) return Camera;
  
  const normalizedSlug = slug.toLowerCase().trim();
  
  // Match esatto
  if (JOB_TYPE_ICON_MAP[normalizedSlug]) {
    return JOB_TYPE_ICON_MAP[normalizedSlug];
  }
  
  // Match parziale (contiene la keyword)
  for (const [key, icon] of Object.entries(JOB_TYPE_ICON_MAP)) {
    if (normalizedSlug.includes(key) || key.includes(normalizedSlug)) {
      return icon;
    }
  }
  
  return Camera;
}

interface JobTypeIconProps {
  slug: string | undefined | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Componente React per renderizzare l'icona del tipo di lavoro
 */
export function JobTypeIcon({ slug, className, size = 'md' }: JobTypeIconProps) {
  const Icon = getJobTypeIcon(slug);
  
  const sizeClasses = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };
  
  return <Icon className={cn(sizeClasses[size], className)} />;
}

/**
 * Componente per icona con testo del tipo di lavoro
 */
interface JobTypeBadgeProps {
  slug: string | undefined | null;
  name: string;
  className?: string;
  iconClassName?: string;
}

export function JobTypeBadge({ slug, name, className, iconClassName }: JobTypeBadgeProps) {
  const Icon = getJobTypeIcon(slug);
  
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Icon className={cn("w-4 h-4", iconClassName)} />
      <span>{name}</span>
    </span>
  );
}

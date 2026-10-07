import type { ReactNode } from 'react';
import { getThemeById } from '@shared/special-themes';

interface SpecialGalleryThemeProps {
  themeId?: string | null;
  children: ReactNode;
}

export default function SpecialGalleryTheme({ themeId, children }: SpecialGalleryThemeProps) {
  // Only catalogued IDs may become CSS classes. Older, removed themes use the normal gallery.
  const theme = themeId && themeId !== 'none' ? getThemeById(themeId) : undefined;

  return (
    <div className={`min-h-screen ${theme ? `theme-${theme.id}` : 'bg-off-white'} custom-cursor`}>
      {children}
    </div>
  );
}
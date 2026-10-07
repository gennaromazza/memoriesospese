import { SpecialTheme } from './schema';

// Temi stagionali predefiniti hardcoded
export const PREDEFINED_THEMES: Omit<SpecialTheme, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>[] = [
  {
    name: 'Natale',
    icon: '🎄',
    description: 'Tema natalizio con colori rosso e verde',
    active: true,
    colors: {
      primary: '#c41e3a', // Rosso Natale
      secondary: '#165b33', // Verde Natale
      accent: '#ffd700', // Oro
    },
    styles: {
      bannerBg: 'bg-gradient-to-r from-red-800 to-green-800',
      galleryBg: 'bg-red-50 dark:bg-red-950',
      buttonStyle: 'bg-red-700 hover:bg-red-800 text-white',
      textColor: 'text-red-900 dark:text-red-100',
    },
  },
  {
    name: 'Carnevale',
    icon: '🎭',
    description: 'Tema carnevalesco con colori vivaci e festosi',
    active: true,
    colors: {
      primary: '#ff6b35', // Arancione
      secondary: '#9b4dca', // Viola
      accent: '#f7b731', // Giallo oro
    },
    styles: {
      bannerBg: 'bg-gradient-to-r from-orange-600 to-purple-600',
      galleryBg: 'bg-orange-50 dark:bg-orange-950',
      buttonStyle: 'bg-orange-600 hover:bg-orange-700 text-white',
      textColor: 'text-orange-900 dark:text-orange-100',
    },
  },
  {
    name: 'San Valentino',
    icon: '💕',
    description: 'Tema romantico per San Valentino',
    active: true,
    colors: {
      primary: '#ff1744', // Rosa intenso
      secondary: '#ff80ab', // Rosa chiaro
      accent: '#f50057', // Rosa accento
    },
    styles: {
      bannerBg: 'bg-gradient-to-r from-pink-600 to-rose-600',
      galleryBg: 'bg-pink-50 dark:bg-pink-950',
      buttonStyle: 'bg-pink-600 hover:bg-pink-700 text-white',
      textColor: 'text-pink-900 dark:text-pink-100',
    },
  },
  {
    name: 'Pasqua',
    icon: '🐰',
    description: 'Tema pasquale con colori pastello',
    active: true,
    colors: {
      primary: '#9c27b0', // Viola pastello
      secondary: '#ffd54f', // Giallo pastello
      accent: '#81c784', // Verde pastello
    },
    styles: {
      bannerBg: 'bg-gradient-to-r from-purple-400 to-yellow-400',
      galleryBg: 'bg-purple-50 dark:bg-purple-950',
      buttonStyle: 'bg-purple-500 hover:bg-purple-600 text-white',
      textColor: 'text-purple-900 dark:text-purple-100',
    },
  },
  {
    name: 'Halloween',
    icon: '🎃',
    description: 'Tema spettrale per Halloween',
    active: true,
    colors: {
      primary: '#ff6f00', // Arancione zucca
      secondary: '#4a148c', // Viola scuro
      accent: '#000000', // Nero
    },
    styles: {
      bannerBg: 'bg-gradient-to-r from-orange-700 to-purple-900',
      galleryBg: 'bg-orange-100 dark:bg-gray-900',
      buttonStyle: 'bg-orange-700 hover:bg-orange-800 text-white',
      textColor: 'text-orange-900 dark:text-orange-100',
    },
  },
];

// Helper per ottenere un tema per ID
export const getThemeById = (id: string): (Omit<SpecialTheme, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'> & { id: string }) | undefined => {
  const normalizedId = id.toLowerCase().replace(/\s+/g, '-');
  const theme = PREDEFINED_THEMES.find(t => {
    const themeId = t.name.toLowerCase().replace(/\s+/g, '-');
    return themeId === normalizedId;
  });
  
  if (!theme) return undefined;
  
  return {
    ...theme,
    id: normalizedId,
  };
};

// Helper per ottenere tutti i temi come array con ID
export const getAllThemes = (): (Omit<SpecialTheme, 'createdAt' | 'updatedAt' | 'createdBy'> & { id: string })[] => {
  return PREDEFINED_THEMES.map(theme => ({
    ...theme,
    id: theme.name.toLowerCase().replace(/\s+/g, '-'),
  }));
};

// Helper per ottenere solo gli ID dei temi (per filtering)
export const getSpecialThemeIds = (): string[] => {
  return PREDEFINED_THEMES.map(theme => 
    theme.name.toLowerCase().replace(/\s+/g, '-')
  );
};

import React from 'react';
import { getAllThemes } from '../../../../../lib/shared-src/special-themes';

interface SpecialThemePickerProps {
  value: string;
  onChange: (themeId: string) => void;
}

const specialThemes = getAllThemes();

export function SpecialThemePicker({ value, onChange }: SpecialThemePickerProps) {
  const selectedTheme = specialThemes.find(theme => theme.id === value);

  return (
    <div className="space-y-2">
      <label htmlFor="gallery-special-theme" className="text-sm font-medium leading-none">
        Tema stagionale
      </label>
      <select
        id="gallery-special-theme"
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        onChange={event => onChange(event.target.value)}
      >
        <option value="none">Nessun tema (galleria normale)</option>
        {value !== 'none' && value && !selectedTheme && (
          <option value={value}>Tema precedente non disponibile ({value})</option>
        )}
        {specialThemes.map(theme => (
          <option key={theme.id} value={theme.id}>{theme.icon} {theme.name}</option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {selectedTheme
          ? selectedTheme.description
          : value === 'none'
            ? 'Nessun tema stagionale selezionato.'
            : `Tema corrente non più disponibile: ${value}`}
      </p>
      <p className="text-xs text-muted-foreground">Un tema speciale richiede un PIN. Per passare da password a tema, inserisci un nuovo PIN prima di salvare.</p>
    </div>
  );
}
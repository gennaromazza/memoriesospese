import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DEFAULT_HOMEPAGE_CONTENT, type HomepageContent } from '@shared/homepage-content';

type Section = keyof Omit<HomepageContent, 'version'>;

interface Props {
  value: HomepageContent;
  onChange: <S extends Section>(section: S, field: keyof HomepageContent[S], value: string) => void;
}

function ContentField({
  id, label, value, defaultValue, multiline = false, onChange,
}: {
  id: string;
  label: string;
  value: string;
  defaultValue: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-medium text-stone-600">{label}</Label>
        {value !== defaultValue && (
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => onChange(defaultValue)}>
            <RotateCcw className="mr-1 h-3 w-3" /> Predefinito
          </Button>
        )}
      </div>
      {multiline ? (
        <Textarea id={id} value={value} onChange={(event) => onChange(event.target.value)} rows={3} />
      ) : (
        <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

export default function HomepageContentEditor({ value, onChange }: Props) {
  const sections: Array<{
    key: Section;
    title: string;
    description: string;
    fields: Array<{ key: string; label: string; multiline?: boolean }>;
  }> = [
    {
      key: 'hero', title: 'Hero principale', description: 'Titoli e pulsanti della prima sezione della homepage.',
      fields: [
        { key: 'eyebrow', label: 'Etichetta superiore' },
        { key: 'title', label: 'Titolo principale', multiline: true },
        { key: 'tagline', label: 'Frase evidenziata' },
        { key: 'description', label: 'Descrizione', multiline: true },
        { key: 'signature', label: 'Firma' },
        { key: 'primaryCta', label: 'Pulsante principale' },
        { key: 'portfolioCta', label: 'Pulsante portfolio' },
        { key: 'galleryAccessText', label: 'Collegamento accesso galleria', multiline: true },
      ],
    },
    {
      key: 'portfolio', title: 'Anteprima portfolio', description: 'Testi sopra la selezione fotografica.',
      fields: [
        { key: 'title', label: 'Titolo' },
        { key: 'description', label: 'Descrizione', multiline: true },
        { key: 'cta', label: 'Testo pulsante' },
      ],
    },
    {
      key: 'secondaryServices', title: 'Servizi secondari', description: 'Presentazione di battesimi, comunioni e altri eventi.',
      fields: [
        { key: 'title', label: 'Titolo' },
        { key: 'description', label: 'Descrizione', multiline: true },
        { key: 'cta', label: 'Testo pulsante' },
      ],
    },
    {
      key: 'whatsapp', title: 'Contatto WhatsApp', description: 'Sezione di contatto mostrata prima del footer.',
      fields: [
        { key: 'title', label: 'Titolo' },
        { key: 'subtitle', label: 'Sottotitolo' },
        { key: 'description', label: 'Descrizione', multiline: true },
        { key: 'buttonText', label: 'Testo pulsante' },
        { key: 'initialMessage', label: 'Messaggio iniziale WhatsApp', multiline: true },
      ],
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      {sections.map((section) => (
        <div key={section.key} className="rounded-lg border border-stone-200 bg-stone-50/50 p-4">
          <h4 className="text-sm font-semibold text-stone-700">{section.title}</h4>
          <p className="mb-4 mt-1 text-xs text-stone-500">{section.description}</p>
          <div className="space-y-3">
            {section.fields.map((field) => {
              const sectionValue = value[section.key] as unknown as Record<string, string>;
              const defaults = DEFAULT_HOMEPAGE_CONTENT[section.key] as unknown as Record<string, string>;
              return (
                <ContentField
                  key={field.key}
                  id={`homepage-${section.key}-${field.key}`}
                  label={field.label}
                  value={sectionValue[field.key]}
                  defaultValue={defaults[field.key]}
                  multiline={field.multiline}
                  onChange={(nextValue) => onChange(section.key as any, field.key as any, nextValue)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

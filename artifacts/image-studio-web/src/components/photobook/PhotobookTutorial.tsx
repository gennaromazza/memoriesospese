import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  BookImage,
  Layers,
  Upload,
  Link2,
  Pencil,
  ClipboardCheck,
  Lock,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface TutorialStep {
  icon: typeof BookImage;
  title: string;
  description: string;
  points: string[];
}

const STEPS: TutorialStep[] = [
  {
    icon: BookImage,
    title: '1. Crea il fotolibro',
    description:
      'Da "Nuovo Fotolibro" scegli nome, galleria collegata e cliente. La galleria serve al cliente per selezionare le foto sostitutive.',
    points: [
      'Il sistema genera automaticamente un link segreto di revisione.',
      'Ogni fotolibro parte dalla Versione 1.',
    ],
  },
  {
    icon: Upload,
    title: '2. Carica le pagine',
    description:
      'Apri l\'editor del fotolibro e carica le pagine della bozza come immagini (JPG, PNG o WebP), anche tutte insieme.',
    points: [
      'La numerazione delle pagine viene assegnata automaticamente in sequenza.',
      'Puoi eliminare singole pagine: le richieste del cliente su quella pagina vengono ripulite in automatico.',
    ],
  },
  {
    icon: Link2,
    title: '3. Invia il link al cliente',
    description:
      'Copia il link di revisione con il pulsante "Copia link" e invialo al cliente (email o WhatsApp).',
    points: [
      'Il link non richiede password: il token segreto è già nel link.',
      'Il cliente vede solo la versione corrente della bozza.',
    ],
  },
  {
    icon: Pencil,
    title: '4. Il cliente segna le modifiche',
    description:
      'Il cliente sfoglia le pagine e disegna una X colorata (o un tratto a penna) sul punto da modificare.',
    points: [
      'Tipi di richiesta: Sostituisci foto (scelta dalla galleria), Elimina, Modifica (con nota).',
      'Le richieste restano in bozza finché il cliente non preme "Invia": partono tutte insieme.',
      'Ad ogni invio viene salvato uno snapshot della pagina con i segni disegnati.',
      'Il cliente può cancellare una richiesta già inviata se ci ripensa.',
    ],
  },
  {
    icon: ClipboardCheck,
    title: '5. Rivedi le richieste',
    description:
      'Nella sezione "Modifiche Fotolibro" trovi tutte le richieste ricevute, con snapshot, foto sostitutiva scelta e note.',
    points: [
      'Segna le richieste come gestite man mano che le applichi alla bozza.',
    ],
  },
  {
    icon: Layers,
    title: '6. Nuova versione della bozza',
    description:
      'Dopo aver fatto correggere l\'album, crea una nuova Versione e carica le pagine aggiornate.',
    points: [
      'Il cliente vedrà solo la nuova versione: non può segnare modifiche su bozze vecchie.',
      'Lo storico delle richieste delle versioni precedenti resta consultabile.',
      'Si ripete il ciclo finché il cliente non approva.',
    ],
  },
  {
    icon: Lock,
    title: '7. Manda in Stampa',
    description:
      'Quando l\'album è approvato, premi "Manda in Stampa": il fotolibro si blocca definitivamente.',
    points: [
      'Il cliente vede il banner "Album mandato in stampa" e non può più inviare o cancellare richieste.',
      'Il blocco è applicato anche lato server, non solo grafico.',
      'Solo tu puoi sbloccarlo se serve un\'altra revisione.',
    ],
  },
];

export default function PhotobookTutorial() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) setStep(0);
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => handleOpenChange(true)}
        data-testid="button-photobook-tutorial"
      >
        <HelpCircle className="h-4 w-4 mr-2" />
        Guida
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className="h-5 w-5 text-primary" />
              {current.title}
            </DialogTitle>
            <DialogDescription>{current.description}</DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 text-sm">
            {current.points.map((p, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-primary mt-0.5">•</span>
                <span className="text-muted-foreground">{p}</span>
              </li>
            ))}
          </ul>

          <div className="flex justify-center gap-1.5 pt-2">
            {STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Passo ${i + 1}`}
                onClick={() => setStep(i)}
                className={`h-2 w-2 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : 'bg-muted-foreground/25'
                }`}
              />
            ))}
          </div>

          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              data-testid="button-tutorial-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Indietro
            </Button>
            {isLast ? (
              <Button size="sm" onClick={() => setOpen(false)} data-testid="button-tutorial-close">
                Ho capito!
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
                data-testid="button-tutorial-next"
              >
                Avanti
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

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
  Box,
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
      'Da "Nuovo Fotolibro" scegli se collegarlo a un lavoro oppure crearlo autonomo. Nei fotolibri collegati la galleria fornisce le foto sostitutive per il mockup; negli autonomi carichi le pagine già impaginate.',
    points: [
      'Il sistema genera un link segreto per il cliente.',
      'Ogni fotolibro parte dalla versione 1.',
    ],
  },
  {
    icon: Upload,
    title: '2. Carica e pubblica le pagine',
    description:
      'Premi "Apri editor", carica le pagine (JPG, PNG o WebP) e controllale. Una nuova versione resta privata finché non premi "Pubblica versione e avvisa cliente".',
    points: [
      'Il numero nel nome del file (es. 7.jpg) diventa il numero di pagina.',
      'Alla pubblicazione il cliente riceve l’email con il suo solito link.',
      'Il link si copia anche con "Copia link cliente".',
    ],
  },
  {
    icon: Pencil,
    title: '3. Il cliente controlla le pagine',
    description:
      'Il cliente sfoglia le pagine e segna con una X le foto da cambiare, oppure approva l’impaginato.',
    points: [
      'Le richieste partono tutte insieme quando preme "Invia".',
      'Le trovi in "Modifiche Fotolibro", con snapshot, foto sostitutiva e note.',
    ],
  },
  {
    icon: Layers,
    title: '4. Correggi con una nuova versione',
    description:
      'Applica le modifiche, poi nell’editor premi "Nuova versione", carica le pagine aggiornate e pubblica.',
    points: [
      'Il cliente vede solo la versione pubblicata.',
      'Si ripete finché il cliente non approva.',
    ],
  },
  {
    icon: Box,
    title: '5. Assegna il modello dell’album',
    description:
      'Nell’editor, card "Mockup dell’album", passo 2: "Assegna modello". Scegli un modello oppure più modelli tra cui sceglierà il cliente.',
    points: [
      'Per il Quadrobook decidi tu il formato in cm e la copertina: foto del cliente, tua grafica o a scelta del cliente.',
      'Il cliente non può cambiare il formato.',
    ],
  },
  {
    icon: ClipboardCheck,
    title: '6. Bozza, verifica e conferma',
    description:
      'Al passo 3 scegli chi prepara la bozza: tu, oppure il cliente dopo aver approvato le pagine. Al passo 4 "Rivedi e conferma".',
    points: [
      'Se la prepara il cliente, riceve il link appena approva le pagine.',
      'Dopo la conferma: "Invia email: mockup pronto" e "Allega all’invio fotolibro su Drive".',
    ],
  },
  {
    icon: Lock,
    title: '7. Manda in stampa',
    description:
      'Quando pagine e mockup sono a posto, premi "Manda in stampa" nella lista: il fotolibro si blocca.',
    points: [
      'Il cliente vede "Album mandato in stampa" e non può più inviare richieste.',
      'Solo tu puoi sbloccarlo se serve un’altra revisione.',
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

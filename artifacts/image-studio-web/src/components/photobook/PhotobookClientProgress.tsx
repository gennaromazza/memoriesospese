import { CheckCircle2, Lock } from 'lucide-react';

interface Props {
  approved: boolean;
  locked: boolean;
  isCurrentVersion: boolean;
  /** Se true il cliente personalizza il mockup, altrimenti lo prepara lo studio. */
  clientConfigures: boolean;
  compact?: boolean;
}

/** Percorso del cliente, uguale su telefono e computer: pagine → album → stampa. */
export default function PhotobookClientProgress({ approved, locked, isCurrentVersion, clientConfigures, compact = false }: Props) {
  const printing = locked;
  const stage = !isCurrentVersion ? 0 : printing ? 3 : approved ? 2 : 1;
  const steps = [
    { n: 1, title: 'Controlla le pagine', done: approved || printing },
    { n: 2, title: clientConfigures ? 'Personalizza l’album' : 'Mockup dello studio', done: printing },
    { n: 3, title: 'Stampa', done: false },
  ];
  const message = !isCurrentVersion ? 'Stai guardando una versione precedente, in sola lettura.'
    : printing ? 'Il tuo album è stato mandato in stampa: non si può più modificare.'
    : !approved ? 'Sfoglia le pagine, segnala le correzioni e poi approva l’impaginato.'
    : clientConfigures ? 'Pagine approvate. Ora scegli tessuti, foto e copertina del tuo album: puoi modificarli fino alla stampa.'
    : 'Pagine approvate. Lo studio sta preparando il mockup e ti avviserà via email.';
  return (
    <nav aria-label="Avanzamento del fotolibro" className={`rounded-lg border bg-white ${compact ? 'mx-1 my-1 p-2.5' : 'p-4'} space-y-2`} data-testid="photobook-client-progress">
      <ol className="flex items-stretch gap-1.5">
        {steps.map(step => {
          const active = step.n === stage;
          return (
            <li key={step.n} aria-current={active ? 'step' : undefined} className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs sm:text-sm ${active ? 'bg-emerald-50 font-semibold text-emerald-900 ring-1 ring-emerald-300' : step.done ? 'text-emerald-800' : 'text-stone-500'}`}>
              {step.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden /> : step.n === 3 && !printing ? <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <span aria-hidden className="shrink-0">{step.n}.</span>}
              <span className="truncate">{step.title}</span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs sm:text-sm text-stone-600" role="status">{message}</p>
    </nav>
  );
}

import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createUrl } from '../lib/basePath';
import { useSEO } from '../hooks/useSEO';
import { VademecumContent } from '../features/vademecum/VademecumContent';
import { VADEMECUM_NATALE_2026_CONTENT } from '../features/vademecum/natale-2026';
import { VADEMECUM_NATALE_2026 } from '@shared/seasonal-vademecum';

/** Pagina pubblica del vademecum: linkata dal modulo di prenotazione e dalle email ai clienti. */
export default function VademecumNatale2026() {
  useSEO({
    title: 'Vademecum di Natale 2026 | Image Studio',
    description: 'Tutto quello che serve sapere prima del vostro shooting di Natale: persone, animali, cambio d’abito, spostamenti, puntualità.',
    canonical: VADEMECUM_NATALE_2026.path,
  });
  return (
    <div className="min-h-screen bg-off-white px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Link href={createUrl('/prenota')}>
            <Button variant="ghost" className="text-sage-600 hover:text-sage-700">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna alle prenotazioni
            </Button>
          </Link>
        </div>
        <div className="rounded-lg bg-white p-6 shadow-lg sm:p-10">
          <VademecumContent content={VADEMECUM_NATALE_2026_CONTENT} />
        </div>
      </div>
    </div>
  );
}

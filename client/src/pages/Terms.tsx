import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createUrl } from '../lib/basePath';

export default function Terms() {
  return (
    <div className="min-h-screen bg-off-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href={createUrl('/landing')}>
            <Button variant="ghost" className="text-sage-600 hover:text-sage-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Landing
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold text-blue-gray-900 mb-8">Termini e Condizioni</h1>
          
          <div className="prose prose-blue-gray max-w-none">
            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Accettazione dei Termini</h2>
            <p className="mb-6 text-gray-600">
              Utilizzando Memorie Sospese, accetti automaticamente questi termini e condizioni. 
              Se non sei d'accordo, ti preghiamo di non utilizzare il nostro servizio.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Servizio Offerto</h2>
            <p className="mb-6 text-gray-600">
              Memorie Sospese fornisce una piattaforma digitale per la creazione e gestione di gallerie fotografiche 
              per matrimoni ed eventi. Il servizio include hosting, condivisione e funzionalità interattive.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Responsabilità dell'Utente</h2>
            <ul className="list-disc pl-6 mb-6 text-gray-600">
              <li>Utilizzare il servizio in modo legale e appropriato</li>
              <li>Non caricare contenuti offensivi o protetti da copyright</li>
              <li>Mantenere riservate le proprie credenziali di accesso</li>
              <li>Rispettare i limiti del piano di abbonamento scelto</li>
            </ul>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Pagamenti e Rimborsi</h2>
            <p className="mb-6 text-gray-600">
              I pagamenti vengono elaborati tramite Stripe. Gli abbonamenti sono rinnovati automaticamente. 
              I rimborsi sono disponibili entro 14 giorni dall'acquisto, secondo le nostre policy.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Limitazioni del Servizio</h2>
            <p className="mb-6 text-gray-600">
              Ci riserviamo il diritto di sospendere o terminare account che violano questi termini. 
              Il servizio è fornito "così com'è" senza garanzie esplicite.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Proprietà Intellettuale</h2>
            <p className="mb-6 text-gray-600">
              Tu mantieni tutti i diritti sui contenuti che carichi. Concedi a Memorie Sospese una licenza 
              per ospitare e visualizzare i tuoi contenuti come parte del servizio.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Contatti</h2>
            <p className="text-gray-600">
              Per domande sui termini di servizio, contattaci a: 
              <a href="mailto:legale@memoriesospese.it" className="text-sage-600 hover:text-sage-700 ml-1">
                legale@memoriesospese.it
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
import { Link } from 'wouter';
import { ArrowLeft, Cookie, Shield, Settings, BarChart3, Megaphone } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createUrl } from '../lib/basePath';

export default function CookiePolicy() {
  return (
    <div className="min-h-screen bg-off-white py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href={createUrl('/')}>
            <Button variant="ghost" className="text-sage-600 hover:text-sage-700">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Homepage
            </Button>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center gap-3 mb-8">
            <Cookie className="w-8 h-8 text-sage" />
            <h1 className="text-3xl font-bold text-blue-gray-900">Cookie Policy</h1>
          </div>
          
          <div className="prose prose-blue-gray max-w-none space-y-8">
            <p className="text-gray-600 text-lg">
              Ultimo aggiornamento: {new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
            </p>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6 text-sage" />
                Cosa sono i Cookie
              </h2>
              <p className="mb-4 text-gray-600">
                I cookie sono piccoli file di testo che vengono memorizzati sul tuo dispositivo quando visiti un sito web. 
                Sono ampiamente utilizzati per far funzionare i siti web in modo più efficiente e per fornire informazioni ai proprietari del sito.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <Settings className="w-6 h-6 text-sage" />
                Cookie Necessari
              </h2>
              <p className="mb-4 text-gray-600">
                Questi cookie sono essenziali per il funzionamento del sito e non possono essere disattivati. 
                Includono cookie per:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li><strong>Autenticazione:</strong> Per mantenere la sessione utente attiva</li>
                <li><strong>Sicurezza:</strong> Per proteggere il sito da attività malevole</li>
                <li><strong>Preferenze:</strong> Per ricordare le tue impostazioni (lingua, tema, consenso cookie)</li>
                <li><strong>Sessione gallerie:</strong> Per l'accesso protetto alle gallerie fotografiche</li>
              </ul>
              <div className="bg-gray-50 rounded-lg p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium">Cookie</th>
                      <th className="text-left py-2 font-medium">Scopo</th>
                      <th className="text-left py-2 font-medium">Durata</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-600">
                    <tr className="border-b">
                      <td className="py-2">image_studio_cookie_consent</td>
                      <td className="py-2">Ricorda il consenso cookie</td>
                      <td className="py-2">1 anno</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">image_studio_cookie_preferences</td>
                      <td className="py-2">Preferenze cookie</td>
                      <td className="py-2">1 anno</td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2">firebase_auth_token</td>
                      <td className="py-2">Autenticazione utente</td>
                      <td className="py-2">Sessione</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-sage" />
                Cookie Analitici
              </h2>
              <p className="mb-4 text-gray-600">
                Questi cookie ci aiutano a capire come i visitatori interagiscono con il sito, raccogliendo informazioni in forma anonima. 
                Le informazioni raccolte includono:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li>Numero di visitatori</li>
                <li>Pagine visitate</li>
                <li>Tempo trascorso sul sito</li>
                <li>Dispositivo e browser utilizzato</li>
              </ul>
              <p className="text-gray-600">
                Utilizziamo questi dati esclusivamente per migliorare le prestazioni e l'usabilità del nostro sito.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <Megaphone className="w-6 h-6 text-sage" />
                Cookie di Marketing
              </h2>
              <p className="mb-4 text-gray-600">
                Questi cookie vengono utilizzati per tracciare i visitatori attraverso i siti web con l'intento di mostrare annunci 
                pertinenti e coinvolgenti per il singolo utente.
              </p>
              <p className="text-gray-600">
                Attualmente <strong>non utilizziamo cookie di marketing</strong> di terze parti. Se in futuro dovessimo implementarli, 
                aggiorneremo questa policy e richiederemo il tuo consenso esplicito.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Come Gestire i Cookie</h2>
              <p className="mb-4 text-gray-600">
                Puoi gestire le tue preferenze sui cookie in qualsiasi momento:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li>
                  <strong>Dal nostro sito:</strong> Clicca sul banner cookie o vai nelle impostazioni del sito
                </li>
                <li>
                  <strong>Dal browser:</strong> Modifica le impostazioni del tuo browser per bloccare o eliminare i cookie
                </li>
              </ul>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                <strong>Nota:</strong> Disabilitare i cookie necessari potrebbe influire sul funzionamento del sito e 
                impedirti di accedere a determinate funzionalità.
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Cookie di Terze Parti</h2>
              <p className="mb-4 text-gray-600">
                Alcuni servizi di terze parti che utilizziamo potrebbero impostare i propri cookie:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li><strong>Firebase (Google):</strong> Per autenticazione e storage</li>
                <li><strong>Stripe:</strong> Per l'elaborazione sicura dei pagamenti</li>
              </ul>
              <p className="text-gray-600">
                Ti invitiamo a consultare le rispettive privacy policy per maggiori informazioni.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">I Tuoi Diritti (GDPR)</h2>
              <p className="mb-4 text-gray-600">
                In conformità al Regolamento Generale sulla Protezione dei Dati (GDPR), hai il diritto di:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li>Essere informato su come vengono utilizzati i tuoi dati</li>
                <li>Accedere ai tuoi dati personali</li>
                <li>Richiedere la rettifica di dati inesatti</li>
                <li>Richiedere la cancellazione dei tuoi dati (diritto all'oblio)</li>
                <li>Opporti al trattamento dei tuoi dati</li>
                <li>Richiedere la portabilità dei dati</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Contatti</h2>
              <p className="text-gray-600">
                Per qualsiasi domanda riguardo ai cookie o alla privacy, contattaci a:{' '}
                <a href="mailto:image.studio.fotografico@gmail.com" className="text-sage-600 hover:text-sage-700">
                  image.studio.fotografico@gmail.com
                </a>
              </p>
            </section>

            <section className="border-t pt-6 mt-8">
              <p className="text-sm text-gray-500">
                Consulta anche la nostra{' '}
                <Link href={createUrl('/privacy')} className="text-sage-600 hover:underline">
                  Privacy Policy
                </Link>
                {' '}per maggiori informazioni sul trattamento dei dati personali.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

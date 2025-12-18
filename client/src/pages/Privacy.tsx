import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createUrl } from '../lib/basePath';

export default function Privacy() {
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
          <h1 className="text-3xl font-bold text-blue-gray-900 mb-8">Privacy Policy</h1>
          
          <div className="prose prose-blue-gray max-w-none">
            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Informazioni Generali</h2>
            <p className="mb-6 text-gray-600">
              Image Studio Fotografico si impegna a proteggere la privacy degli utenti e dei loro dati personali. 
              Questa privacy policy descrive come raccogliamo, utilizziamo e proteggiamo le tue informazioni.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Dati Raccolti</h2>
            <ul className="list-disc pl-6 mb-6 text-gray-600">
              <li>Informazioni di registrazione (nome, email, telefono)</li>
              <li>Foto e contenuti multimediali caricati</li>
              <li>Dati di utilizzo della piattaforma</li>
              <li>Informazioni di pagamento (gestite tramite Stripe)</li>
            </ul>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Utilizzo dei Dati</h2>
            <p className="mb-6 text-gray-600">
              I tuoi dati vengono utilizzati esclusivamente per fornire il servizio di gallerie fotografiche, 
              elaborare pagamenti e migliorare l'esperienza utente. Non vendiamo mai i tuoi dati a terzi.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Protezione dei Dati</h2>
            <p className="mb-6 text-gray-600">
              Utilizziamo Firebase e tecnologie di sicurezza avanzate per proteggere i tuoi dati. 
              Tutte le comunicazioni sono crittografate e i server sono protetti secondo i più alti standard di sicurezza.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">I Tuoi Diritti</h2>
            <p className="mb-6 text-gray-600">
              Hai il diritto di accedere, modificare o eliminare i tuoi dati personali in qualsiasi momento. 
              Puoi anche richiedere una copia di tutti i dati che abbiamo su di te.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Contatti</h2>
            <p className="text-gray-600">
              Per qualsiasi domanda riguardo alla privacy, contattaci a: 
              <a href="mailto:image.studio.fotografico@gmail.com" className="text-sage-600 hover:text-sage-700 ml-1">
                image.studio.fotografico@gmail.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
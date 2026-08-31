import { Link } from 'wouter';
import { ArrowLeft, Shield, Database, Lock, UserCheck, Mail, FileText, AlertCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createUrl } from '../lib/basePath';
import { useSEO } from '../hooks/useSEO';
import { useStudio } from '../context/StudioContext';
import {
  PRINT_SHOP_MAX_PICKUP_DAYS,
  resolveStudioLegalDetails,
} from '../features/print-shop/studio-legal-details';

export default function Privacy() {
  const { studioSettings } = useStudio();
  const seller = resolveStudioLegalDetails(studioSettings);

  useSEO({
    title: 'Privacy Policy | Image Studio',
    description: 'Informativa privacy di Image Studio per servizi fotografici, account cliente e ordini online di stampe fotografiche.',
    canonical: '/privacy',
  });

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
            <Shield className="w-8 h-8 text-sage" />
            <h1 className="text-3xl font-bold text-blue-gray-900">Privacy Policy</h1>
          </div>
          
          <div className="prose prose-blue-gray max-w-none space-y-8">
            <p className="text-gray-600 text-lg">
              Ultimo aggiornamento: 31 agosto 2026
            </p>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Titolare del Trattamento</h2>
              <div className="bg-gray-50 rounded-lg p-4 text-gray-600">
                {seller.name && <p><strong>{seller.name}</strong></p>}
                {seller.partitaIVA && <p>P. IVA: {seller.partitaIVA}</p>}
                {seller.address && <p>Sede: {seller.address}</p>}
                {seller.phone && <p>Telefono: <a href={`tel:${seller.phone.replace(/[^\d+]/g, '')}`} className="text-sage-600 hover:underline">{seller.phone}</a></p>}
                {seller.email && <p>Email: <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></p>}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Ordini di stampa, pagamento e ritiro</h2>
              <p className="mb-4 text-gray-600">
                I dati di contatto e dell'ordine vengono utilizzati per confermare il pagamento, affidare la produzione
                al laboratorio selezionato, comunicare lo stato e rendere le stampe disponibili per il ritiro in sede entro
                e non oltre {PRINT_SHOP_MAX_PICKUP_DAYS} giorni dal pagamento. Quando il checkout mostra «Ambiente di prova
                PayPal», la transazione è simulata e non produce alcun addebito reale.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <Database className="w-6 h-6 text-sage" />
                Dati Raccolti
              </h2>
              <p className="mb-4 text-gray-600">
                Raccogliamo i seguenti tipi di dati personali:
              </p>
              
              <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">Dati forniti direttamente dall'utente:</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-1">
                <li>Nome e cognome</li>
                <li>Indirizzo email</li>
                <li>Numero di telefono</li>
                <li>Data e dettagli dell'evento (per prenotazioni)</li>
                <li>Foto e contenuti multimediali caricati nelle gallerie</li>
                <li>File JPG, preferenze di stampa, quantità e note inserite negli ordini di stampa</li>
                <li>Dati dell'ordine, del ritiro in sede e identificativi delle transazioni PayPal</li>
                <li>Risposte ai questionari pre-servizio</li>
              </ul>

              <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">Dati raccolti automaticamente:</h3>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-1">
                <li>Indirizzo IP (anonimizzato)</li>
                <li>Tipo di browser e dispositivo</li>
                <li>Pagine visitate e tempo di permanenza</li>
                <li>Data e ora di accesso</li>
                <li>Metadati tecnici dei file (nome, dimensione, risoluzione e impronta di integrità)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <FileText className="w-6 h-6 text-sage" />
                Base Giuridica del Trattamento
              </h2>
              <p className="mb-4 text-gray-600">
                Il trattamento dei tuoi dati personali si basa su:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li><strong>Consenso (Art. 6.1.a GDPR):</strong> Per l'invio di comunicazioni promozionali e newsletter</li>
                <li><strong>Esecuzione contrattuale (Art. 6.1.b GDPR):</strong> Per la fornitura dei servizi fotografici richiesti</li>
                <li><strong>Interesse legittimo (Art. 6.1.f GDPR):</strong> Per migliorare i nostri servizi e la sicurezza del sito</li>
                <li><strong>Obbligo legale (Art. 6.1.c GDPR):</strong> Per adempiere a obblighi fiscali e contabili</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Finalità del Trattamento</h2>
              <p className="mb-4 text-gray-600">
                I tuoi dati vengono utilizzati per:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li>Gestire le prenotazioni e fornire i servizi fotografici</li>
                <li>Creare e gestire le gallerie fotografiche protette</li>
                <li>Elaborare preventivi e gestire i pagamenti</li>
                <li>Preparare, stampare e consegnare gli ordini di stampe fotografiche</li>
                <li>Controllare l'integrità e la risoluzione dei file destinati alla stampa</li>
                <li>Inviare comunicazioni relative al servizio</li>
                <li>Rispondere alle tue richieste di informazioni</li>
                <li>Migliorare l'esperienza utente sul nostro sito</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <Lock className="w-6 h-6 text-sage" />
                Protezione dei Dati
              </h2>
              <p className="mb-4 text-gray-600">
                Adottiamo misure di sicurezza tecniche e organizzative per proteggere i tuoi dati:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li>Crittografia SSL/TLS per tutte le comunicazioni</li>
                <li>Accesso alle gallerie protetto da password/PIN</li>
                <li>Autenticazione sicura tramite Firebase Authentication</li>
                <li>Accesso tramite Google gestito da Firebase Authentication; non riceviamo la password dell'account Google</li>
                <li>Originali degli ordini conservati in un'area Firebase Storage privata, accessibile solo al cliente proprietario e al personale autorizzato</li>
                <li>Backup regolari e procedure di disaster recovery</li>
                <li>Accesso ai dati limitato al personale autorizzato</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Conservazione dei Dati</h2>
              <p className="mb-4 text-gray-600">
                I tuoi dati personali vengono conservati per il tempo strettamente necessario:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li><strong>Dati delle gallerie:</strong> Fino a 12 mesi dalla data dell'evento, salvo richiesta di prolungamento</li>
                <li><strong>Originali degli ordini di stampa:</strong> Fino a 90 giorni dalla consegna, poi cancellazione automatica; eventuali copie già trasferite al laboratorio seguono lo stesso limite o un termine più breve concordato</li>
                <li><strong>Bozze e caricamenti incompleti:</strong> Possono essere rimossi prima, quando non sono più necessari a completare l'ordine</li>
                <li><strong>Dati contabili:</strong> 10 anni come richiesto dalla normativa fiscale italiana</li>
                <li><strong>Dati di contatto:</strong> Fino alla revoca del consenso o alla cancellazione dell'account</li>
                <li><strong>Log di accesso:</strong> 6 mesi per finalità di sicurezza</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Condivisione dei Dati</h2>
              <p className="mb-4 text-gray-600">
                I tuoi dati possono essere condivisi con:
              </p>
              <ul className="list-disc pl-6 mb-4 text-gray-600 space-y-2">
                <li><strong>Firebase/Google Cloud:</strong> Per autenticazione, hosting e archiviazione privata dei dati</li>
                <li><strong>PayPal:</strong> Per autorizzare e incassare il pagamento anticipato; PayPal tratta i dati di pagamento secondo la propria informativa. In ambiente sandbox non avviene alcun addebito reale</li>
                <li><strong>Laboratori di stampa incaricati:</strong> Ricevono esclusivamente i file e le informazioni tecniche necessari a produrre l'ordine, come fornitori autorizzati</li>
                <li><strong>Collaboratori autorizzati:</strong> Fotografi e assistenti che lavorano al tuo evento</li>
              </ul>
              <p className="text-gray-600">
                <strong>Non vendiamo mai i tuoi dati a terzi</strong> per finalità di marketing o altri scopi commerciali.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <UserCheck className="w-6 h-6 text-sage" />
                I Tuoi Diritti (GDPR)
              </h2>
              <p className="mb-4 text-gray-600">
                In conformità al Regolamento (UE) 2016/679 (GDPR), hai diritto a:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-1">Diritto di Accesso</h4>
                  <p className="text-sm text-gray-600">Ottenere conferma e copia dei dati trattati</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-1">Diritto di Rettifica</h4>
                  <p className="text-sm text-gray-600">Correggere dati inesatti o incompleti</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-1">Diritto alla Cancellazione</h4>
                  <p className="text-sm text-gray-600">Richiedere la cancellazione dei tuoi dati (diritto all'oblio)</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-1">Diritto di Limitazione</h4>
                  <p className="text-sm text-gray-600">Limitare il trattamento in determinate circostanze</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-1">Diritto alla Portabilità</h4>
                  <p className="text-sm text-gray-600">Ricevere i tuoi dati in formato strutturato</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-medium text-gray-800 mb-1">Diritto di Opposizione</h4>
                  <p className="text-sm text-gray-600">Opporti al trattamento per motivi legittimi</p>
                </div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>Come esercitare i tuoi diritti:</strong> Invia una richiesta via email a{' '}
                  {seller.email ? <a href={`mailto:${seller.email}`} className="underline">{seller.email}</a> : 'ai contatti del titolare indicati sopra'}{' '}
                  specificando il diritto che intendi esercitare. Risponderemo entro 30 giorni.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-sage" />
                Reclami
              </h2>
              <p className="mb-4 text-gray-600">
                Per segnalazioni o reclami puoi contattare direttamente {seller.name || 'il titolare'}
                {seller.email ? <> all'indirizzo <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></> : null}
                {seller.phone ? <> o al numero <a href={`tel:${seller.phone.replace(/[^\d+]/g, '')}`} className="text-sage-600 hover:underline">{seller.phone}</a></> : null}.
                Se ritieni che il trattamento violi la normativa sulla privacy, resta fermo il diritto di presentare
                reclamo al Garante per la Protezione dei Dati Personali:
              </p>
              <div className="bg-gray-50 rounded-lg p-4 text-gray-600">
                <p><strong>Garante per la Protezione dei Dati Personali</strong></p>
                <p>Sito web: <a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" className="text-sage-600 hover:underline">www.garanteprivacy.it</a></p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4 flex items-center gap-2">
                <Mail className="w-6 h-6 text-sage" />
                Contatti
              </h2>
              <p className="text-gray-600">
                Per qualsiasi domanda riguardo alla privacy o al trattamento dei tuoi dati, contatta {seller.name || 'il titolare'}.
              </p>
              <ul className="mt-3 list-disc pl-6 text-gray-600">
                {seller.email && <li>Email: <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></li>}
                {seller.phone && <li>Telefono: <a href={`tel:${seller.phone.replace(/[^\d+]/g, '')}`} className="text-sage-600 hover:underline">{seller.phone}</a></li>}
                {seller.address && <li>Sede: {seller.address}</li>}
                {seller.partitaIVA && <li>P. IVA: {seller.partitaIVA}</li>}
              </ul>
            </section>

            <section className="border-t pt-6 mt-8">
              <p className="text-sm text-gray-500">
                Consulta anche la nostra{' '}
                <Link href={createUrl('/cookie-policy')} className="text-sage-600 hover:underline">
                  Cookie Policy
                </Link>
                {' '}per informazioni sull'utilizzo dei cookie.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

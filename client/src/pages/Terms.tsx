import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/button';
import { createUrl } from '../lib/basePath';
import { useSEO } from '../hooks/useSEO';
import { useStudio } from '../context/StudioContext';
import {
  PRINT_SHOP_MAX_PICKUP_DAYS,
  resolveStudioLegalDetails,
} from '../features/print-shop/studio-legal-details';

export default function Terms() {
  const { studioSettings } = useStudio();
  const seller = resolveStudioLegalDetails(studioSettings);

  useSEO({
    title: 'Condizioni di vendita e utilizzo | Image Studio',
    description: 'Condizioni applicabili agli ordini online di stampe fotografiche, al pagamento PayPal, al ritiro e alla spedizione.',
    canonical: '/terms',
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
          <h1 className="text-3xl font-bold text-blue-gray-900 mb-2">Condizioni di vendita e utilizzo</h1>
          <p className="text-gray-500 mb-8">Ultimo aggiornamento: 31 agosto 2026</p>
          
          <div className="prose prose-blue-gray max-w-none">
            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Identità del professionista</h2>
            <div className="mb-6 rounded-lg bg-gray-50 p-4 text-gray-600">
              {seller.name && <p><strong>{seller.name}</strong></p>}
              {seller.partitaIVA && <p>P. IVA: {seller.partitaIVA}</p>}
              {seller.address && <p>Sede: {seller.address}</p>}
              {seller.phone && <p>Telefono: <a href={`tel:${seller.phone.replace(/[^\d+]/g, '')}`} className="text-sage-600 hover:underline">{seller.phone}</a></p>}
              {seller.email && <p>Email: <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></p>}
            </div>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Ambito e accettazione</h2>
            <p className="mb-6 text-gray-600">
              Queste condizioni disciplinano l'uso della piattaforma di {seller.name || 'questo professionista'} e gli ordini
              personalizzati di stampe fotografiche. Prima del pagamento il cliente può controllare prodotti,
              quantità, opzioni, prezzo totale e modalità di consegna; l'invio dell'ordine comporta l'accettazione
              di queste condizioni e della Privacy Policy.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Prodotti e configurazione</h2>
            <p className="mb-6 text-gray-600">
              Lo shop consente di caricare esclusivamente file JPG e scegliere formato, quantità, carta lucida
              oppure opaca e una resa tra «foto intera con bordo bianco» e «riempi tutto il foglio». Nel secondo
              caso una piccola parte ai bordi può essere tagliata per riempire il formato. Le anteprime sono
              illustrative: taglio e colore possono variare leggermente per tolleranze di produzione e resa dei monitor.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">File e responsabilità del cliente</h2>
            <ul className="list-disc pl-6 mb-6 text-gray-600 space-y-2">
              <li>Il cliente dichiara di avere i diritti e le autorizzazioni necessari sulle fotografie caricate.</li>
              <li>Il cliente controlla che file, orientamento, quantità e abbinamento al formato siano corretti prima del pagamento.</li>
              <li>Gli avvisi di bassa risoluzione segnalano un possibile risultato meno nitido; proseguendo, il cliente accetta tale rischio qualitativo.</li>
              <li>Non è consentito caricare contenuti illeciti, lesivi o privi delle autorizzazioni necessarie.</li>
            </ul>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Prezzi e pagamento</h2>
            <p className="mb-6 text-gray-600">
              Il prezzo applicato è quello mostrato nel riepilogo finale ed è calcolato nuovamente dal server
              sulla base del catalogo e delle quantità. Il totale indicato è il prezzo finale, con imposte incluse
              ove applicabili; il ritiro in sede non comporta costi di consegna, mentre l'eventuale costo di spedizione
              è mostrato separatamente nel riepilogo e incluso nel totale. Il click sul pulsante PayPal inoltra
              un ordine con obbligo di pagamento. L'ordine entra in lavorazione solo dopo il pagamento anticipato
              completo tramite PayPal e non è previsto il pagamento al ritiro. {seller.name || 'Il professionista'} non
              riceve né conserva i dati completi della carta o del conto PayPal. Quando il checkout mostra la dicitura
              «Ambiente di prova PayPal», l'operazione è simulata e non produce alcun addebito reale.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Produzione, laboratorio, ritiro e spedizione</h2>
            <p className="mb-6 text-gray-600">
              Gli ordini sono ritirati presso {seller.address ? `la sede in ${seller.address}` : 'la sede indicata nei contatti'}{' '}
              quando lo stato risulta «pronto per il ritiro». L'ordine viene reso disponibile per il ritiro entro e non
              oltre {PRINT_SHOP_MAX_PICKUP_DAYS} giorni dal pagamento. {seller.name || 'Il professionista'} può affidare
              la produzione a un laboratorio di stampa qualificato, trasmettendo soltanto i file e le istruzioni necessarie;
              il cliente viene informato di eventuali impedimenti rilevanti.
              Quando la spedizione è abilitata e scelta dal cliente, l'ordine viene inviato all'indirizzo indicato
              nel checkout nei tempi stimati mostrati prima del pagamento. Il cliente è responsabile della correttezza
              di indirizzo, CAP, città, provincia e recapiti forniti. Eventuali ritardi del vettore non modificano i
              diritti del consumatore previsti dalla legge.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Prodotti personalizzati, recesso e difetti</h2>
            <p className="mb-6 text-gray-600">
              Le stampe sono realizzate su misura utilizzando le fotografie e le scelte del cliente. Per i beni
              confezionati su misura o chiaramente personalizzati il diritto di recesso è escluso nei casi previsti
              dall'art. 59 del Codice del Consumo. Restano integri i diritti relativi a prodotti difettosi, danneggiati
              o non conformi all'ordine. Il cliente deve contattarci indicando numero d'ordine e problema riscontrato,
              preferibilmente allegando fotografie, così da consentire la verifica e la ristampa o altro rimedio previsto dalla legge.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Conservazione delle fotografie</h2>
            <p className="mb-6 text-gray-600">
              Gli originali JPG dell'ordine sono conservati in area privata fino a 90 giorni dalla consegna e poi
              eliminati automaticamente. Il cliente deve quindi conservare una propria copia. I dati amministrativi,
              contabili e della transazione restano conservati per i periodi richiesti dalla legge.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Diritti sui contenuti</h2>
            <p className="mb-6 text-gray-600">
              Il cliente mantiene i diritti sulle fotografie e concede a {seller.name || 'questo professionista'} e al laboratorio incaricato
              una licenza limitata, temporanea e non esclusiva per archiviarle, controllarle e riprodurle esclusivamente
              allo scopo di eseguire l'ordine.
            </p>

            <h2 className="text-2xl font-semibold text-blue-gray-800 mb-4">Reclami e contatti</h2>
            <p className="text-gray-600">Per assistenza, contestazioni o reclami relativi a un ordine, indica il numero d'ordine e contatta {seller.name || 'il professionista'}:</p>
            <ul className="mt-3 list-disc pl-6 text-gray-600">
              {seller.email && <li>Email: <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></li>}
              {seller.phone && <li>Telefono: <a href={`tel:${seller.phone.replace(/[^\d+]/g, '')}`} className="text-sage-600 hover:underline">{seller.phone}</a></li>}
              {seller.address && <li>Sede: {seller.address}</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

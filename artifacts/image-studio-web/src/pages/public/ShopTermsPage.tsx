import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { SHOP_LEGAL_MANIFEST, SHOP_LEGAL_TERMS } from '@shared/shop-legal';
import { SHOP_DEFAULT_PHOTO_WAIT_DAYS, SHOP_MAX_PHOTO_BYTES } from '@shared/shop-types';
import { useSEO } from '@/hooks/useSEO';
import { useStudio } from '@/context/StudioContext';
import { resolveStudioLegalDetails } from '@/features/print-shop/studio-legal-details';
import { ShopShell } from '@/features/shop/ShopShell';

const PHOTO_MAX_MB = Math.round(SHOP_MAX_PHOTO_BYTES / (1024 * 1024));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold text-blue-gray-800">{title}</h2>
      <div className="space-y-3 text-gray-600">{children}</div>
    </section>
  );
}

/** Condizioni di vendita dello shop "Shopping online Natale". Versione e numeri vengono da `shop-legal`. */
export default function ShopTermsPage() {
  const { studioSettings } = useStudio();
  const seller = resolveStudioLegalDetails(studioSettings);
  const name = seller.name || 'il professionista';
  const phoneHref = seller.phone ? `tel:${seller.phone.replace(/[^\d+]/g, '')}` : '';

  useSEO({
    title: 'Condizioni di vendita Shopping online Natale | Image Studio',
    description: 'Condizioni di vendita degli ordini online di idee regalo e prodotti personalizzati di Natale: foto, pagamento PayPal, consegna, recesso e conservazione dei dati.',
    canonical: '/shop-natale/condizioni',
    noindex: true,
  });

  return (
    <ShopShell eyebrow="Shop di Natale" title="Condizioni di vendita" subtitle="Shopping online Natale: prodotti, foto, pagamento, consegna e recesso.">
      <article className="rounded-2xl bg-white p-6 shadow-sm sm:p-8">
        <p className="mb-8 text-sm text-gray-500">
          Versione {SHOP_LEGAL_MANIFEST.termsVersion}, ultimo aggiornamento: 10 ottobre 2026
        </p>

        <Section title="Identità del professionista">
          <div className="rounded-lg bg-gray-50 p-4">
            {seller.name && <p><strong>{seller.name}</strong></p>}
            {seller.partitaIVA && <p>P. IVA: {seller.partitaIVA}</p>}
            {seller.address && <p>Sede: {seller.address}</p>}
            {seller.phone && <p>Telefono: <a href={phoneHref} className="text-sage-600 hover:underline">{seller.phone}</a></p>}
            {seller.email && <p>Email: <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></p>}
          </div>
        </Section>

        <Section title="Ambito e accettazione">
          <p>
            Queste condizioni valgono per gli ordini fatti dalla vetrina «Shopping online Natale» di {name}, sia per i prodotti
            personalizzati con le tue foto sia per quelli senza foto. Gli ordini di stampe fotografiche del negozio online hanno
            le loro <Link href="/terms" className="underline">condizioni di vendita e utilizzo</Link>.
          </p>
          <p>
            Per ordinare serve un account. Prima del pagamento vedi prodotti, quantità, prezzo totale e modalità di consegna.
            Per pagare devi accettare queste condizioni e l'<Link href="/privacy" className="underline">informativa privacy</Link>:
            il sistema salva la data e la versione dei testi che hai accettato.
          </p>
        </Section>

        <Section title="Prodotti e ordine">
          <p>
            Ogni prodotto indica il prezzo e, se serve, quante foto devi fornire. Puoi mettere più prodotti nello stesso ordine:
            per ciascun prodotto con foto devi caricare le foto richieste per quella riga.
          </p>
          <p>
            Gli ordini online si accettano fino all'ultimo giorno utile indicato nella vetrina, se presente. Dopo quel giorno
            la vetrina può restare visibile ma non si può più ordinare. Le immagini dei prodotti sono illustrative.
          </p>
        </Section>

        <Section title="Le tue foto">
          <ul className="list-disc space-y-2 pl-6">
            <li>Si accettano solo file JPG, fino a {PHOTO_MAX_MB} MB ciascuno.</li>
            <li>Dichiari di avere i diritti e le autorizzazioni necessari sulle foto che carichi, comprese quelle delle persone ritratte.</li>
            <li>Controlla che le foto siano quelle giuste prima di pagare. Se una foto ha una risoluzione bassa te lo segnaliamo: se la usi lo stesso, il risultato può essere meno nitido.</li>
            <li>Se una foto non è adatta alla lavorazione ti scriviamo e ti chiediamo un'altra foto.</li>
            <li>Non si possono caricare contenuti illeciti, lesivi o privi delle autorizzazioni necessarie.</li>
          </ul>
        </Section>

        <Section title="Foto non ancora caricate">
          <p>
            Puoi pagare subito e caricare le foto dopo, dall'area «I miei ordini». L'ordine entra in lavorazione quando sono
            arrivate tutte le foto richieste. Ti mandiamo promemoria via email.
          </p>
          <p>
            Il tempo per caricarle è indicato nel riepilogo dell'ordine (di norma {SHOP_DEFAULT_PHOTO_WAIT_DAYS} giorni dal pagamento).
            Se le foto non arrivano entro quel termine, {name} può annullare l'ordine e rimborsarti l'intero importo pagato.
            Se carichi le foto in ritardo, la consegna entro Natale può non essere possibile: in quel caso ti avvisiamo.
          </p>
        </Section>

        <Section title="Prezzi e pagamento">
          <p>
            Il prezzo è quello del riepilogo finale, ricalcolato dal sistema sul listino in vigore; include le imposte ove
            applicabili. L'eventuale costo di spedizione è mostrato a parte e incluso nel totale. Con il ritiro in sede non
            ci sono costi di consegna.
          </p>
          <p>
            Si paga in anticipo e per intero con PayPal: non è previsto il pagamento al ritiro. Cliccare il pulsante PayPal
            invia un ordine con obbligo di pagamento. {name} non riceve né conserva i dati della tua carta o del tuo conto PayPal.
            Se il checkout mostra «Ambiente di prova PayPal», l'operazione è simulata e non addebita nulla.
          </p>
        </Section>

        <Section title="Ritiro e spedizione">
          <p>
            Puoi scegliere il ritiro presso {seller.address ? `la sede in ${seller.address}` : 'la sede indicata nei contatti'} oppure,
            quando è attiva, la spedizione. La spedizione è disponibile solo in Italia; costo e tempi stimati li vedi prima di pagare.
            Per spedire ci servono indirizzo di consegna, indirizzo di residenza e codice fiscale. Sei responsabile della
            correttezza di indirizzo, CAP, città, provincia e recapiti.
          </p>
          <p>
            Ti scriviamo quando l'ordine è pronto per il ritiro o è stato spedito (con il codice di tracciamento, se c'è).
          </p>
          <p>
            <strong>Tempi.</strong> Sono indicativi. Di norma l'ordine è pronto in circa {SHOP_LEGAL_TERMS.typicalDeliveryDays} giorni
            dal pagamento, una volta ricevute tutte le foto; con la spedizione, preparazione e consegna a casa richiedono in
            tutto circa lo stesso tempo, quello mostrato prima di pagare. Nei periodi di maggiore richiesta, come quello
            natalizio, e per i ritardi del corriere i tempi possono allungarsi. Non possiamo garantire la consegna entro una
            data precisa, feste comprese: ti consigliamo di ordinare con anticipo, entro l'ultimo giorno indicato nella vetrina.
            Resta fermo il termine massimo di legge: salvo una data diversa comunicata, l'ordine è consegnato o reso disponibile
            comunque entro {SHOP_LEGAL_TERMS.deliveryMaxDays} giorni dal pagamento. I ritardi del corriere non cambiano i diritti
            che la legge ti riconosce come consumatore.
          </p>
        </Section>

        <Section title="Diritto di recesso">
          <p>
            <strong>Prodotti senza foto.</strong> Come consumatore puoi recedere dal contratto senza dare motivazioni entro{' '}
            {SHOP_LEGAL_TERMS.withdrawalDays} giorni da quando ricevi il prodotto (o lo ritiri in sede). Scrivi a {name}
            con una dichiarazione esplicita, anche usando il modello qui sotto, e restituisci il prodotto integro entro{' '}
            {SHOP_LEGAL_TERMS.withdrawalDays} giorni dalla comunicazione. Le spese dirette di restituzione sono a tuo carico.
            Rimborsiamo quanto hai pagato, spedizione standard compresa, entro {SHOP_LEGAL_TERMS.withdrawalDays} giorni dalla
            comunicazione, con lo stesso mezzo di pagamento (PayPal); possiamo attendere di ricevere il prodotto o la prova della spedizione.
          </p>
          <p>
            <strong>Prodotti personalizzati con le tue foto.</strong> Sono realizzati su misura con il tuo materiale. Per i beni
            confezionati su misura o chiaramente personalizzati il diritto di recesso è escluso (art. 59, comma 1, lett. c, del
            Codice del Consumo). Per questo, prima di pagare, ti chiediamo di confermare che hai capito che il prodotto è personalizzato.
          </p>
          <p>
            Se nell'ordine ci sono prodotti di entrambi i tipi, il recesso vale solo per quelli senza foto.
          </p>
          <div className="rounded-lg bg-gray-50 p-4 text-sm">
            <p className="mb-2 font-semibold text-gray-700">Modello per esercitare il recesso</p>
            <p>
              A {name}{seller.email ? ` (${seller.email})` : ''}: con la presente comunico il recesso dal contratto relativo
              all'ordine n. ______ del ______, riguardante i seguenti prodotti: ______________. Nome e cognome: ______________.
              Indirizzo: ______________. Data: ______.
            </p>
          </div>
        </Section>

        <Section title="Prodotti difettosi o diversi dall'ordine">
          <p>
            Restano sempre validi i tuoi diritti di consumatore sui prodotti difettosi, danneggiati o non conformi
            all'ordine (garanzia legale di conformità, artt. 128 e seguenti del Codice del Consumo), anche per i prodotti
            personalizzati. Scrivici indicando il numero d'ordine e il problema, meglio se con delle fotografie: valuteremo
            riparazione, sostituzione o gli altri rimedi previsti dalla legge.
          </p>
        </Section>

        <Section title="Annullamento e rimborsi">
          <p>
            Se {name} annulla un ordine già pagato (per esempio per foto non arrivate o non adatte), rimborsa l'intero importo
            con PayPal. I tempi di accredito dipendono da PayPal. Per gli ordini non pagati, la bozza si può annullare in
            qualsiasi momento dall'area «I miei ordini».
          </p>
        </Section>

        <Section title="Conservazione delle foto">
          <p>
            Le foto dell'ordine sono conservate in un'area privata, visibile solo a te e al personale autorizzato.
            Le cancelliamo automaticamente dopo {SHOP_LEGAL_TERMS.deliveredPhotoRetentionDays} giorni dalla consegna o dal ritiro,
            dopo {SHOP_LEGAL_TERMS.cancelledPhotoRetentionDays} giorni da un annullamento o rimborso e dopo{' '}
            {SHOP_LEGAL_TERMS.draftPhotoRetentionDays} giorni se l'ordine non viene mai pagato. Conserva quindi una copia delle tue
            foto. I dati dell'ordine e della transazione restano per il tempo richiesto dagli obblighi amministrativi e contabili.
          </p>
        </Section>

        <Section title="Diritti sui contenuti">
          <p>
            Le foto restano tue. Concedi a {name} e a chi collabora alla realizzazione dell'ordine una licenza limitata,
            temporanea e non esclusiva per archiviarle, controllarle e riprodurle solo per eseguire l'ordine.
          </p>
        </Section>

        <Section title="Assistenza e reclami">
          <p>Per assistenza o reclami indica il numero d'ordine e contatta {name}:</p>
          <ul className="list-disc pl-6">
            {seller.email && <li>Email: <a href={`mailto:${seller.email}`} className="text-sage-600 hover:underline">{seller.email}</a></li>}
            {seller.phone && <li>Telefono: <a href={phoneHref} className="text-sage-600 hover:underline">{seller.phone}</a></li>}
            {seller.address && <li>Sede: {seller.address}</li>}
          </ul>
        </Section>
      </article>
    </ShopShell>
  );
}

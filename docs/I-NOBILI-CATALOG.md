# Campionario i Nobili e Plaza LED

Fonte: `CARTELLA COLORI_260919_165038.pdf`, 86 pagine raster, una per codice. SHA-256 e pagina sono registrati nel catalogo `client/public/mockups/i-nobili/catalog.json`.

I codici sono trascritti dalle pagine e mantengono l'ordine originale (A00, A10–A21; B22–B30, B62–B67, B94–B95; C31–C42; D43–D48, D68–D74; T03; F51–F55; G56–G61, G81–G85; H75–H80; I86–I93). Le serie non indicano una composizione merceologica verificata.

Ogni variante contiene una pagina campione originale rasterizzata in WebP con logo e codice, un ritaglio separato per il rendering, hash, pagina fonte e ID stabile. Il campione originale non riceve le correzioni dei bordi impiegate sulla texture ripetibile. La scala fisica e il rilievo non sono misurati: `physicalScaleVerified: false`, bump disabilitato e mappa altezza neutra. Le immagini sono indicate al cliente come campioni dal catalogo, senza presentarle come nuove fotografie certificate o campioni colorimetrici.

Per rigenerare gli asset dal medesimo PDF: `python scripts/build-i-nobili-assets.py PERCORSO_PDF` (Pillow, numpy, pypdfium2). Lo script verifica l'hash della fonte.

## Configurazione

Plaza rev. 2 salva `materialId` per telaio esterno e album; `innerMaterialId` e `innerAppearanceRevision` per il telaio interno. Configurazioni storiche senza queste chiavi usano il rivestimento esterno anche per l'interno. Salvataggio, invio e conferma controllano entrambi i materiali rispetto all'offerta. Il riepilogo del cliente e il report di produzione riportano entrambe le scelte.

Il LED Plaza ha un comando sincronizzato anche in casa. Le sorgenti calde illuminano le superfici e generano ombre; nella modalità serale Plaza le luci decorative del mobile restano spente per consentire il confronto con il solo LED dell'album. Intensità e dimensioni restano illustrative, non una simulazione fotometrica certificata.

## Database

L'importazione è predisposta, NON eseguita sul database di produzione: in questa sessione `FIREBASE_ADMIN_CREDENTIALS` non è configurato.

Dopo aver pubblicato il codice, dalla scheda amministrativa del laboratorio i Nobili aprire Campionario e usare “Importa i Nobili · 86 campioni e Plaza LED”. L'endpoint autenticato `POST /api/labs/:labId/mockup-catalog/import-i-nobili` richiede il nome laboratorio normalizzato `inobili`. Aggiunge/aggiorna gli 86 materiali, associa i loro ID al Plaza e conserva altri modelli/materiali. Importazioni ripetute identiche non incrementano la revisione. Le offerte già pubblicate sono snapshot e non vengono riscritte. Le nuove offerte e il salvataggio del catalogo riservano Plaza LED a i Nobili; i vecchi documenti di altri laboratori non sono eliminati.

I link dei campioni sono risolti tramite il catalogo applicativo immutabile e i codici stabili. L'importazione non carica nuovamente il PDF né file su servizi esterni.

## Verifica

114 test Vitest (cataloghi e asset periodici, workflow laboratori, route mockup, revisioni e geometria), TypeScript, build Vite e verifica CSS superati. Test browser: 86 varianti, selezioni indipendenti, campione corretto, comando LED sincronizzato, rotazione/estrazione, 8 viste esportate, retrocompatibilità e controlli mobili.

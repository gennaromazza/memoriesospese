# ADR-0002 — Real Wedding con bozza AI e pubblicazione editoriale esplicita

- **Stato:** accettato dal codice esistente
- **Data:** 2026-09-02

## Contesto

Il sistema Real Wedding raccoglie dati da galleria, job e moduli informativi. Il testo generato può diventare contenuto pubblico SEO e può contenere dati personali o affermazioni non verificate.

## Decisione

La generazione AI produce esclusivamente una bozza. L'admin:

1. seleziona manualmente risposte e foto;
2. genera;
3. rivede e modifica;
4. salva;
5. pubblica con un'azione esplicita.

Le fonti devono avere consenso editoriale. La ricerca dei fornitori è accessoria; un URL viene mantenuto solo con match ufficiale ad alta confidenza. Il testo viene sanitizzato prima del rendering.

## Conseguenze

- `draft` e `published` sono stati distinti;
- il prerender SEO e la sitemap devono ignorare le bozze;
- un errore AI/provider non deve produrre una pubblicazione parziale;
- i dati non presenti nelle fonti non devono essere inventati;
- cambi al contratto di bozza richiedono test server e client.

## Alternative scartate

Pubblicare direttamente la risposta del modello o selezionare automaticamente tutte le submission ridurrebbe il controllo umano e aumenterebbe il rischio di pubblicare PII, errori o dettagli non verificati.
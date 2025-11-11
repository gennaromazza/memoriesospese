import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import * as pdfParseModule from 'pdf-parse';

const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

export interface CSVJobData {
  dataCreazione: string;
  nome: string;
  tipoLavoro: string;
  provenienza: string;
  dataEvento: string;
  location: string;
  nomeCliente: string;
  email: string;
  telefono: string;
  operatori: string;
  settore: string;
  note: string;
}

export interface ClienteData {
  nome?: string;
  cognome?: string;
  email?: string;
  cellulare?: string;
  via?: string;
  citta?: string;
  cap?: string;
}

export interface EventoData {
  data?: string;
  location?: string;
  tipoLavoro?: string;
  orarioInizio?: string;
  orarioFine?: string;
  rituLocation?: string;
  rituTime?: string;
}

export interface PagamentoData {
  descrizione: string;
  importo?: number;
  data?: string;
  metodo?: 'contante' | 'carta' | 'bonifico' | 'paypal';
  pagato?: boolean;
  tipo?: 'acconto' | 'saldo';
}

export interface ParsedJobData extends CSVJobData {
  pdfData?: {
    // Clienti (entrambi gli sposi)
    cliente1?: ClienteData;
    cliente2?: ClienteData;
    
    // Dati evento
    evento?: EventoData;
    
    // Pagamenti dettagliati
    pagamenti: PagamentoData[];
    importoTotale?: number;
    
    // Legacy - deprecato ma mantenuto per compatibilità
    prodotti: Array<{
      nome: string;
      prezzo?: number;
      quantita?: number;
    }>;
  };
  folderPath?: string;
}

export class LegacyImportParser {
  private basePath: string;

  constructor(basePath: string = 'attached_assets/EXPORTVECCHIOGESTIONALE') {
    this.basePath = basePath;
  }

  async parseCSV(csvPath?: string): Promise<CSVJobData[]> {
    const finalPath = csvPath || path.join(this.basePath, 'Lavori_lista20251109.csv');
    
    if (!fs.existsSync(finalPath)) {
      throw new Error(`CSV file not found at ${finalPath}`);
    }

    const csvContent = fs.readFileSync(finalPath, 'utf-8');
    
    return new Promise((resolve, reject) => {
      Papa.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const jobs = results.data.map((row: any) => ({
            dataCreazione: row['Data creazione'] || '',
            nome: row['Nome'] || '',
            tipoLavoro: row['Tipo lavoro'] || '',
            provenienza: row['Provenienza'] || '',
            dataEvento: row['Data Evento'] || '',
            location: row['Location'] || '',
            nomeCliente: row['Nome del cliente'] || '',
            email: row['E-mail'] || '',
            telefono: row['Telefono'] || '',
            operatori: row['Operatori'] || '',
            settore: row['Settore'] || '',
            note: row['Note'] || '',
          }));
          resolve(jobs.filter(job => job.nome));
        },
        error: (error: any) => reject(error),
      });
    });
  }

  async parsePDF(pdfPath: string): Promise<ParsedJobData['pdfData']> {
    if (!fs.existsSync(pdfPath)) {
      console.warn(`PDF not found: ${pdfPath}`);
      return {
        prodotti: [],
        pagamenti: [],
      };
    }

    try {
      const dataBuffer = fs.readFileSync(pdfPath);
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text;

      return this.extractDataFromPDFText(text);
    } catch (error: any) {
      console.error(`Error parsing PDF ${pdfPath}:`, error);
      return {
        prodotti: [],
        pagamenti: [],
      };
    }
  }

  private extractDataFromPDFText(text: string): ParsedJobData['pdfData'] {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const data: ParsedJobData['pdfData'] = {
      cliente1: {},
      cliente2: {},
      evento: {},
      prodotti: [],
      pagamenti: [],
    };

    // ESTRAZIONE CLIENTI con pattern label-based (Nome:, Cognome:, Email:, etc.)
    let currentCliente: 1 | 2 = 1;
    let nomeCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lowerLine = line.toLowerCase();
      
      // Pattern: "Nome:" o "Nome :" → prossima riga o stesso riga
      // ✅ Regex case-insensitive che accetta maiuscolo, minuscolo, accenti, apostrofi
      if (lowerLine.includes('nome:') || lowerLine.match(/^nome\s*$/i)) {
        // ✅ Incrementa PRIMA di assegnare per determinare quale cliente
        nomeCount++;
        const targetCliente = nomeCount === 1 ? 1 : 2;
        
        // Pattern flessibile: accetta UPPERCASE, lowercase, accenti, apostrofi, spazi
        const nomeMatch = line.match(/nome[:\s]+([A-ZÀ-ÿa-z'\s]+?)(?:\s*$|Cognome|Email|Tel|Cell|Via)/i);
        if (nomeMatch) {
          const nome = nomeMatch[1].trim();
          if (nome.length > 0) {
            if (targetCliente === 1) {
              data.cliente1!.nome = nome;
            } else {
              data.cliente2!.nome = nome;
            }
          }
        } else if (i + 1 < lines.length) {
          // Nome è nella prossima riga
          const nextLine = lines[i + 1];
          const nameMatch = nextLine.match(/^([A-ZÀ-ÿa-z'\s]+)$/i);
          if (nameMatch && nameMatch[1].trim().length > 0) {
            if (targetCliente === 1) {
              data.cliente1!.nome = nameMatch[1].trim();
            } else {
              data.cliente2!.nome = nameMatch[1].trim();
            }
          }
        }
        
        if (nomeCount >= 2) {
          currentCliente = 2;  // Passa a cliente2
        }
      }
      
      // Pattern: "Cognome:" → prossima riga o stesso riga
      // ✅ Regex case-insensitive che accetta maiuscolo, minuscolo, accenti, apostrofi
      if (lowerLine.includes('cognome:') || lowerLine.match(/^cognome\s*$/i)) {
        const cognomeMatch = line.match(/cognome[:\s]+([A-ZÀ-ÿa-z'\s]+?)(?:\s*$|Email|Tel|Cell|Via|Data)/i);
        if (cognomeMatch) {
          const cognome = cognomeMatch[1].trim();
          if (cognome.length > 0) {
            if (currentCliente === 1) {
              data.cliente1!.cognome = cognome;
            } else {
              data.cliente2!.cognome = cognome;
            }
          }
        } else if (i + 1 < lines.length) {
          // Cognome è nella prossima riga
          const nextLine = lines[i + 1];
          const surnameMatch = nextLine.match(/^([A-ZÀ-ÿa-z'\s]+)$/i);
          if (surnameMatch && surnameMatch[1].trim().length > 0) {
            if (currentCliente === 1) {
              data.cliente1!.cognome = surnameMatch[1].trim();
            } else {
              data.cliente2!.cognome = surnameMatch[1].trim();
            }
          }
        }
      }
      
      // Email (pattern: qualcosa@qualcosa.com)
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        if (!data.cliente1!.email) {
          data.cliente1!.email = emailMatch[1];
        } else if (!data.cliente2!.email) {
          data.cliente2!.email = emailMatch[1];
        }
      }
      
      // Telefono/Cellulare (pattern: varie forme)
      if (lowerLine.includes('telefono') || lowerLine.includes('cellulare') || lowerLine.includes('cell')) {
        const telMatch = line.match(/(\+?\d{2,3}[\s\-]?\d{2,4}[\s\-]?\d{3,4}[\s\-]?\d{3,4}|\d{10})/);
        if (telMatch) {
          const cleanTel = telMatch[1].replace(/[\s\-]/g, '');
          if (!data.cliente1!.cellulare) {
            data.cliente1!.cellulare = cleanTel;
          } else if (!data.cliente2!.cellulare) {
            data.cliente2!.cellulare = cleanTel;
          }
        }
      }
      
      // Indirizzo (Via, Viale, Corso, Piazza)
      const viaMatch = line.match(/(?:Via|Viale|Corso|Piazza)\s+([^,\n]+)/i);
      if (viaMatch) {
        if (!data.cliente1!.via) {
          data.cliente1!.via = viaMatch[0].trim();
        } else if (!data.cliente2!.via) {
          data.cliente2!.via = viaMatch[0].trim();
        }
      }
      
      // CAP (5 cifre)
      if (lowerLine.includes('cap') || lowerLine.match(/\b\d{5}\b/)) {
        const capMatch = line.match(/\b(\d{5})\b/);
        if (capMatch) {
          if (!data.cliente1!.cap) {
            data.cliente1!.cap = capMatch[1];
          } else if (!data.cliente2!.cap && data.cliente2!.via) {
            data.cliente2!.cap = capMatch[1];
          }
        }
      }
      
      // Città (cerca dopo label "Città:" o "Località:")
      if (lowerLine.includes('citt') || lowerLine.includes('localit')) {
        // ✅ Cattura valore DOPO label, fermandosi PRIMA di Cap/Provincia/Tel/Email
        const cittaMatch = line.match(/(?:citt[àa]|localit[àa])[:\s]+([A-ZÀ-ÿa-z'\s]+?)(?=\s*(?:Cap|CAP|Provincia|PROVINCIA|Prov|Tel|Cell|Email|$))/i);
        if (cittaMatch && !line.match(/Via|Viale|Corso|Piazza/i)) {
          const citta = cittaMatch[1].trim();
          if (citta.length > 2) {  // Minimo 3 caratteri per essere una città valida
            // ✅ Usa currentCliente invece di controllare se via è già popolato
            if (currentCliente === 1) {
              data.cliente1!.citta = citta;
            } else {
              data.cliente2!.citta = citta;
            }
          }
        }
      }
    }

    // ESTRAZIONE DATI EVENTO
    // Data evento (cerca pattern DD/MM/YYYY)
    const dataMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (dataMatch) {
      data.evento!.data = dataMatch[0];
    }
    
    // Location (cerca dopo "Location:" o "Luogo:")
    const locationMatch = text.match(/(?:Location|Luogo)[:\s]+([^\n]+)/i);
    if (locationMatch) {
      data.evento!.location = locationMatch[1].trim();
    }
    
    // Orario (cerca pattern HH:MM o HH.MM)
    const orarioMatches = text.match(/(\d{1,2})[:\.](\d{2})/g);
    if (orarioMatches && orarioMatches.length > 0) {
      data.evento!.orarioInizio = orarioMatches[0];
      if (orarioMatches.length > 1) {
        data.evento!.orarioFine = orarioMatches[1];
      }
    }

    // ESTRAZIONE IMPORTO TOTALE
    const totaleRegex = /(?:Totale|TOTALE|Total|Importo\s+totale)[:\s]*€?\s*([\d.,]+)/i;
    const totaleMatch = text.match(totaleRegex);
    if (totaleMatch) {
      const importoStr = totaleMatch[1].replace(/\./g, '').replace(',', '.');
      data.importoTotale = parseFloat(importoStr);
    }

    // ESTRAZIONE PAGAMENTI (più dettagliata)
    const pagamentoKeywords = ['acconto', 'saldo', 'rata', 'anticipo', 'caparra', '1°', '2°', '3°'];
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      for (const keyword of pagamentoKeywords) {
        if (lowerLine.includes(keyword.toLowerCase())) {
          const importoMatch = line.match(/€?\s*([\d.,]+)/);
          const dataMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          
          // Determina se è acconto o saldo
          let tipo: 'acconto' | 'saldo' = 'acconto';
          if (lowerLine.includes('saldo')) {
            tipo = 'saldo';
          }
          
          // Cerca metodo di pagamento
          let metodo: 'contante' | 'carta' | 'bonifico' | 'paypal' | undefined;
          if (lowerLine.includes('contant')) metodo = 'contante';
          else if (lowerLine.includes('cart')) metodo = 'carta';
          else if (lowerLine.includes('bonific')) metodo = 'bonifico';
          else if (lowerLine.includes('paypal')) metodo = 'paypal';
          
          // Determina se pagato o programmato
          const pagato = lowerLine.includes('pagato') || lowerLine.includes('ricevuto');
          
          data.pagamenti.push({
            descrizione: line,
            importo: importoMatch ? parseFloat(importoMatch[1].replace(/\./g, '').replace(',', '.')) : undefined,
            data: dataMatch ? dataMatch[0] : undefined,
            tipo,
            metodo,
            pagato,
          });
          
          break; // Evita duplicati per lo stesso keyword
        }
      }
    }

    // Rimuovi prodotti duplicati o invalidi (legacy - non più usato)
    data.prodotti = [];

    return data;
  }

  async parseAll(): Promise<ParsedJobData[]> {
    const csvJobs = await this.parseCSV();
    const results: ParsedJobData[] = [];

    for (const job of csvJobs) {
      const folderName = job.nome.trim();
      const pdfPath = path.join(
        this.basePath,
        folderName,
        'Modulo di prenotazione',
        'Modulo di prenotazione.pdf'
      );

      const pdfData = await this.parsePDF(pdfPath);

      results.push({
        ...job,
        pdfData,
        folderPath: path.join(this.basePath, folderName),
      });
    }

    return results;
  }

  // Mappature da vecchio a nuovo sistema
  static mapJobType(oldType: string): string {
    const mapping: Record<string, string> = {
      'Wedding': 'matrimonio',
      'MIA SPOSA 2024': 'matrimonio',
      'Mia Sposa 2023': 'matrimonio',
      'WEDDING - CASERTA BRIDAL COUTURE': 'matrimonio',
      'Comunione': 'comunione',
      'Battesimo': 'battesimo',
      'Compleanno': 'compleanno',
    };
    
    return mapping[oldType] || 'matrimonio';
  }

  static mapProvenance(oldProvenance: string): string {
    const mapping: Record<string, string> = {
      'Fiera': 'fiera',
      'Facebook': 'facebook',
      'Instagram': 'instagram',
      'Passaparola': 'passaparola',
      'MATRIMONIO.COM': 'sito_web',
      'Google': 'google',
    };
    
    return mapping[oldProvenance] || 'altro';
  }

  // Converti data da DD/MM/YYYY a YYYY-MM-DD
  static convertDate(dateStr: string): string {
    if (!dateStr) return '';
    
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    return dateStr;
  }

  // Estrai nomi clienti separati (es. "Andrea e Alessia" -> ["Andrea", "Alessia"])
  static extractClientNames(fullName: string): string[] {
    const separators = [' e ', ' E ', ' & ', ' and '];
    let names = [fullName];
    
    for (const sep of separators) {
      if (fullName.includes(sep)) {
        names = fullName.split(sep).map(n => n.trim());
        break;
      }
    }
    
    return names.filter(n => n.length > 0);
  }
}

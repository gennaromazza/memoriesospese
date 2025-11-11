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

export interface ParsedJobData extends CSVJobData {
  pdfData?: {
    indirizzo?: string;
    cap?: string;
    citta?: string;
    provincia?: string;
    codiceFiscale?: string;
    prodotti: Array<{
      nome: string;
      prezzo?: number;
      quantita?: number;
    }>;
    pagamenti: Array<{
      descrizione: string;
      importo?: number;
      data?: string;
    }>;
    importoTotale?: number;
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
    const lines = text.split('\n').map(line => line.trim());
    
    const data: ParsedJobData['pdfData'] = {
      prodotti: [],
      pagamenti: [],
    };

    // Estrai indirizzo (cerca pattern comuni)
    const indirizzoRegex = /(?:Via|Viale|Corso|Piazza)\s+[^\n]+/i;
    const indirizzoMatch = text.match(indirizzoRegex);
    if (indirizzoMatch) {
      data.indirizzo = indirizzoMatch[0].trim();
    }

    // Estrai CAP (5 cifre)
    const capRegex = /\b\d{5}\b/;
    const capMatch = text.match(capRegex);
    if (capMatch) {
      data.cap = capMatch[0];
    }

    // Estrai città e provincia
    const cittaProvRegex = /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\(([A-Z]{2})\)/;
    const cittaProvMatch = text.match(cittaProvRegex);
    if (cittaProvMatch) {
      data.citta = cittaProvMatch[1];
      data.provincia = cittaProvMatch[2];
    }

    // Estrai codice fiscale (16 caratteri alfanumerici)
    const cfRegex = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/;
    const cfMatch = text.match(cfRegex);
    if (cfMatch) {
      data.codiceFiscale = cfMatch[0];
    }

    // Estrai importo totale (cerca pattern come "Totale: €1.500,00" o "€ 1.500,00")
    const totaleRegex = /(?:Totale|TOTALE|Total)[:\s]*€?\s*([\d.,]+)/i;
    const totaleMatch = text.match(totaleRegex);
    if (totaleMatch) {
      const importoStr = totaleMatch[1].replace(/\./g, '').replace(',', '.');
      data.importoTotale = parseFloat(importoStr);
    }

    // Estrai prodotti (cerca righe con prezzi)
    const prodottoRegex = /(.+?)\s+€?\s*([\d.,]+)/g;
    let match;
    while ((match = prodottoRegex.exec(text)) !== null) {
      const nome = match[1].trim();
      const prezzoStr = match[2].replace(/\./g, '').replace(',', '.');
      const prezzo = parseFloat(prezzoStr);
      
      if (nome.length > 3 && prezzo > 0 && prezzo < 50000) {
        data.prodotti.push({
          nome,
          prezzo,
          quantita: 1,
        });
      }
    }

    // Estrai pagamenti (cerca pattern come "Acconto", "Saldo", "Rata")
    const pagamentoKeywords = ['acconto', 'saldo', 'rata', 'anticipo', 'caparra'];
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const keyword of pagamentoKeywords) {
        if (lowerLine.includes(keyword)) {
          const importoMatch = line.match(/€?\s*([\d.,]+)/);
          const dataMatch = line.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
          
          data.pagamenti.push({
            descrizione: line,
            importo: importoMatch ? parseFloat(importoMatch[1].replace(/\./g, '').replace(',', '.')) : undefined,
            data: dataMatch ? dataMatch[0] : undefined,
          });
        }
      }
    }

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

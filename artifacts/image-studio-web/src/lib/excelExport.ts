import * as XLSX from 'xlsx';

/**
 * Esporta dati in un file Excel
 * 
 * @param data Array di oggetti da esportare
 * @param fileName Nome del file Excel da generare
 * @param sheetName Nome del foglio Excel
 */
export function exportToExcel(
  data: any[],
  fileName: string = 'download.xlsx', 
  sheetName: string = 'Foglio1'
): void {
  try {
    // Crea un nuovo workbook
    const workbook = XLSX.utils.book_new();
    
    // Converti l'array di oggetti in un worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Aggiungi il worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Esporta il workbook in un file blob
    XLSX.writeFile(workbook, fileName);
    
    
  } catch (error) {
    
    throw error;
  }
}

/**
 * Formatta le richieste di password per l'esportazione in Excel
 * 
 * @param requests Array di richieste di password
 * @returns Array di oggetti formattati per Excel
 */
export function formatPasswordRequestsForExcel(requests: any[]): any[] {
  return requests.map(request => {
    // Converti il timestamp Firebase in un formato data leggibile
    const timestamp = request.createdAt?.toDate?.() || 
                      request.timestamp ||
                      new Date();
    
    const formattedDate = timestamp instanceof Date 
      ? timestamp.toLocaleString() 
      : 'Data sconosciuta';
    
    // Restituisci un oggetto formattato per Excel
    return {
      'Data': formattedDate,
      'Nome': request.firstName || '',
      'Cognome': request.lastName || '',
      'Email': request.email || '',
      'Relazione': request.relation || '',
      'Galleria': request.galleryName || 'Sconosciuta',
      'Codice Galleria': request.galleryCode || '',
      'Stato': request.status || 'completata'
    };
  });
}
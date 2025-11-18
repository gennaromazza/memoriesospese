import { format } from "date-fns";

/**
 * Formatta una stringa di data in un formato leggibile
 * Accetta vari formati di input e cerca di renderli in un formato coerente
 * @param dateStr stringa di data (ISO, yyyy-mm-dd, dd/mm/yyyy, o testo)
 * @returns data formattata come "dd MMMM yyyy"
 */
export const formatDateString = (dateStr: string): string => {
  try {
    // Per date in formato ISO
    if (dateStr.includes('T')) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return format(date, 'dd MMMM yyyy');
      }
    }
    
    // Per date in formati già leggibili (es. "Maggio 2025")
    if (!dateStr.includes('-') && !dateStr.includes('/')) {
      return dateStr;
    }
    
    // Per date in formato standard yyyy-mm-dd o dd/mm/yyyy
    if (dateStr.includes('-') || dateStr.includes('/')) {
      const parts = dateStr.includes('-') 
        ? dateStr.split('-')
        : dateStr.split('/');
      
      if (parts.length === 3) {
        // Determina se la data è in formato yyyy-mm-dd o dd/mm/yyyy
        const isYearFirst = parts[0].length === 4;
        const year = isYearFirst ? parts[0] : parts[2];
        const month = isYearFirst ? parts[1] : parts[1];
        const day = isYearFirst ? parts[2] : parts[0];
        
        const date = new Date(Number(year), Number(month) - 1, Number(day));
        if (!isNaN(date.getTime())) {
          return format(date, 'dd MMMM yyyy');
        }
      }
    }
    
    // Ritorna la data originale se non è stato possibile formattarla
    return dateStr;
  } catch (e) {
    
    return dateStr;
  }
};
import fs from 'fs';
import * as pdfParseModule from 'pdf-parse';

const pdfParse = (pdfParseModule as any).default ?? pdfParseModule;

async function main() {
  const pdfPath = '../attached_assets/EXPORTVECCHIOGESTIONALE/Matrimonio Francesco e Rosaria/Modulo di prenotazione/Modulo di prenotazione.pdf';
  const dataBuffer = fs.readFileSync(pdfPath);
  
  const data = await pdfParse(dataBuffer);
  console.log(data.text);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

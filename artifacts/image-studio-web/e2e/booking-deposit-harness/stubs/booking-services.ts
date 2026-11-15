export async function getCampaignByCode(code: string) {
  return {
    id: "campaign-browser-test",
    code,
    nome: "Shooting di prova",
    descrizione: "Campagna fittizia per testare il checkout.",
    dataInizio: new Date("2030-12-01T00:00:00.000Z"),
    dataFine: new Date("2030-12-03T23:59:59.000Z"),
    durataShootingMinuti: 30,
    prodottiDisponibili: [],
    attiva: true,
    richiedeApprovazione: false,
    richiedeAcconto: true,
    accontoImportoCentesimi: 2500,
  };
}

export async function getAllProducts() {
  return [];
}

export async function getAvailableSlots() {
  return [{
    start: "2030-12-01T09:00:00.000Z",
    end: "2030-12-01T09:30:00.000Z",
    startTime: "10:00",
    endTime: "10:30",
  }];
}

export async function createBooking() {
  throw new Error("Il checkout con acconto non deve usare la creazione standard.");
}

export class BookingRequestError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
    this.name = "BookingRequestError";
  }
}

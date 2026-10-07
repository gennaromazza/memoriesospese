import { JobCollaboratoriSection, type JobCollaboratoriDataSource } from '@/components/jobs/JobCollaboratoriSection';
import type { Collaboratore, JobCollaboratoreAssignment } from '@shared/collaboratori-types';
import type { Order } from '@shared/booking-types';

const JOB_ID = 'job-products-e2e';
const ASSIGNMENT_ID = 'assignment-products-e2e';
const STORAGE_KEY = '__collaborator-products-e2e-assignment__';

const collaborator = {
  id: 'collaborator-products-e2e',
  nome: 'Luca',
  cognome: 'Verdi',
  email: 'luca@example.test',
  ruolo: 'videomaker',
  attivo: true,
} as Collaboratore;

function initialAssignment(): JobCollaboratoreAssignment {
  return {
    id: ASSIGNMENT_ID,
    jobId: JOB_ID,
    collaboratoreId: collaborator.id,
    ruoloInJob: 'videomaker',
    compenso: 450,
    tipoPagamento: 'forfait',
    prodottiAssegnati: [{ orderItemId: 'product-drone', label: 'Drone', qty: 1 }],
    status: 'accepted',
    isPagato: false,
    saldoResiduo: 350,
    pagamenti: [{
      id: 'payment-e2e',
      tipo: 'acconto',
      importo: 100,
      data: { _seconds: 1_790_000_000, _nanoseconds: 0 } as any,
      metodo: 'bonifico',
    }],
    dataRichiesta: null as any,
    createdAt: null as any,
    updatedAt: null as any,
    mansioniAssegnate: ['Ritocco colore storico'],
  } as JobCollaboratoreAssignment;
}

function readAssignment(): JobCollaboratoreAssignment {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) as JobCollaboratoreAssignment : initialAssignment();
}

const order = {
  id: 'order-products-e2e',
  jobId: JOB_ID,
  prodotti: [
    { prodottoId: 'product-drone', prodottoNome: 'Drone', quantita: 1 },
    { prodottoId: 'product-album', prodottoNome: 'Album', quantita: 1 },
  ],
} as unknown as Order;

const dataSource: JobCollaboratoriDataSource = {
  getAllCollaboratori: async () => [collaborator],
  getJobAssignments: async () => [readAssignment()],
  getOrdersByJobId: async () => [order],
  updateAssignmentProducts: async (assignmentId, data) => {
    if (assignmentId !== ASSIGNMENT_ID) {
      throw new Error(`Assegnazione di test non prevista: ${assignmentId}`);
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...readAssignment(),
      prodottiAssegnati: data.prodottiAssegnati ?? [],
    }));
  },
};

/** Harness dev-only: usa il vero componente e una persistenza isolata nel browser. */
export default function CollaboratorProductsE2EHarness() {
  return (
    <main className="min-h-screen bg-background p-3 sm:p-6">
      <JobCollaboratoriSection jobId={JOB_ID} dataSource={dataSource} />
    </main>
  );
}
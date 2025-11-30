/**
 * COLLABORATORI LIBRARY - CRUD Operations
 * Gestione collaboratori su Firestore
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { apiRequest } from "./queryClient";
import type {
  Collaboratore,
  InsertCollaboratore,
  UpdateCollaboratore,
  JobCollaboratoreAssignment,
  InsertJobCollaboratoreAssignment,
  CollaboratoreStats,
  CollaboratorPaymentType,
  PaymentMethod,
} from "@shared/collaboratori-types";

const COLLABORATORI_COLLECTION = "collaboratori";
const ASSIGNMENTS_COLLECTION = "jobCollaboratoreAssignments";

/**
 * Crea nuovo collaboratore (usa endpoint backend per inviare email benvenuto)
 */
export async function createCollaboratore(
  data: InsertCollaboratore,
): Promise<string> {
  try {
    const response = await apiRequest("POST", "/api/collaboratori", data);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore creazione collaboratore");
    }

    const result = await response.json();
    console.log("✅ Collaboratore creato:", result.id);
    return result.id;
  } catch (error) {
    console.error("❌ Errore creazione collaboratore:", error);
    throw error;
  }
}

/**
 * Get collaboratore by ID
 */
export async function getCollaboratore(
  id: string,
): Promise<Collaboratore | null> {
  try {
    const response = await apiRequest("GET", `/api/collaboratori/${id}`);

    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error("Errore caricamento collaboratore");
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Errore get collaboratore:", error);
    throw error;
  }
}

/**
 * Get tutti i collaboratori
 */
export async function getAllCollaboratori(
  attiviOnly = false,
): Promise<Collaboratore[]> {
  try {
    const url = attiviOnly
      ? "/api/collaboratori?attiviOnly=true"
      : "/api/collaboratori";

    const response = await apiRequest("GET", url);

    if (!response.ok) throw new Error("Errore caricamento collaboratori");

    return await response.json();
  } catch (error) {
    console.error("❌ Errore get collaboratori:", error);
    throw error;
  }
}

/**
 * Update collaboratore (usa endpoint backend per eventuale invio email)
 */
export async function updateCollaboratore(
  id: string,
  data: UpdateCollaboratore,
): Promise<void> {
  try {
    const response = await apiRequest("PATCH", `/api/collaboratori/${id}`, data);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore aggiornamento collaboratore");
    }

    console.log("✅ Collaboratore aggiornato:", id);
  } catch (error) {
    console.error("❌ Errore update collaboratore:", error);
    throw error;
  }
}

/**
 * Assegna collaboratore a job (usa endpoint backend per inviare email)
 */
export async function assignCollaboratoreToJob(
  data: InsertJobCollaboratoreAssignment,
): Promise<string> {
  try {
    const response = await apiRequest(
      "POST",
      "/api/collaboratori/assign-to-job",
      data,
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore assegnazione collaboratore");
    }

    const result = await response.json();
    console.log("✅ Collaboratore assegnato a job:", result.id);
    return result.id;
  } catch (error) {
    console.error("❌ Errore assegnazione collaboratore:", error);
    throw error;
  }
}

/**
 * Aggiorna prodotti e mansioni assegnate
 */
export async function updateAssignmentProductsTasks(
  assignmentId: string,
  data: {
    prodottiAssegnati?: Array<{ orderItemId: string; label: string; qty?: number }>;
    mansioniAssegnate?: string[];
  }
): Promise<void> {
  try {
    const response = await apiRequest(
      "PATCH",
      `/api/collaboratori/assignments/${assignmentId}/products-tasks`,
      data
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore aggiornamento assegnazione");
    }

    console.log("✅ Prodotti/mansioni aggiornati per assegnazione:", assignmentId);
  } catch (error) {
    console.error("❌ Errore aggiornamento prodotti/mansioni:", error);
    throw error;
  }
}

/**
 * Rimuovi assegnazione collaboratore da job
 */
export async function removeAssignment(assignmentId: string): Promise<void> {
  try {
    const response = await apiRequest(
      "DELETE",
      `/api/collaboratori/assignments/${assignmentId}`,
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore rimozione assegnazione");
    }

    console.log("✅ Assegnazione rimossa:", assignmentId);
  } catch (error) {
    console.error("❌ Errore rimozione assegnazione:", error);
    throw error;
  }
}

/**
 * Genera token dashboard per collaboratore esistente
 */
export async function generateDashboardToken(collaboratoreId: string): Promise<string> {
  try {
    const response = await apiRequest(
      "POST",
      `/api/collaboratori/${collaboratoreId}/generate-token`,
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore generazione token");
    }

    const result = await response.json();
    console.log("✅ Token generato per collaboratore:", collaboratoreId);
    return result.dashboardToken;
  } catch (error) {
    console.error("❌ Errore generazione token:", error);
    throw error;
  }
}

/**
 * Modifica compenso assegnazione con notifica email opzionale
 */
export async function updateAssignmentCompenso(
  assignmentId: string,
  compenso: number,
  noteModifica?: string,
  sendEmail: boolean = true,
): Promise<void> {
  try {
    const response = await apiRequest(
      "PATCH",
      `/api/collaboratori/assignments/${assignmentId}/compenso`,
      { compenso, noteModifica, sendEmail },
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore aggiornamento compenso");
    }

    console.log("✅ Compenso aggiornato:", assignmentId);
  } catch (error) {
    console.error("❌ Errore aggiornamento compenso:", error);
    throw error;
  }
}

/**
 * Get assegnazioni per job
 */
export async function getJobAssignments(
  jobId: string,
): Promise<JobCollaboratoreAssignment[]> {
  try {
    const response = await apiRequest(
      "GET",
      `/api/collaboratori/assignments/job/${jobId}`,
    );

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();

    const assignments = data.map((assignment: any) => ({
      ...assignment,
      dataRichiesta: assignment.dataRichiesta
        ? new Timestamp(
            assignment.dataRichiesta._seconds,
            assignment.dataRichiesta._nanoseconds,
          )
        : null,
      dataRisposta: assignment.dataRisposta
        ? new Timestamp(
            assignment.dataRisposta._seconds,
            assignment.dataRisposta._nanoseconds,
          )
        : null,
      createdAt: assignment.createdAt
        ? new Timestamp(
            assignment.createdAt._seconds,
            assignment.createdAt._nanoseconds,
          )
        : null,
      updatedAt: assignment.updatedAt
        ? new Timestamp(
            assignment.updatedAt._seconds,
            assignment.updatedAt._nanoseconds,
          )
        : null,
      pagamenti:
        assignment.pagamenti?.map((p: any) => ({
          ...p,
          data: p.data
            ? new Timestamp(p.data._seconds, p.data._nanoseconds)
            : null,
        })) ?? [],
    }));

    return assignments.sort((a, b) => {
      const timeA = a.dataRichiesta?.toMillis() || 0;
      const timeB = b.dataRichiesta?.toMillis() || 0;
      return timeB - timeA;
    });
  } catch (error) {
    console.error("❌ Errore get job assignments:", error);
    throw error;
  }
}

/**
 * Get assegnazioni per collaboratore
 */
export async function getCollaboratoreAssignments(
  collaboratoreId: string,
): Promise<JobCollaboratoreAssignment[]> {
  try {
    const q = query(
      collection(db, ASSIGNMENTS_COLLECTION),
      where("collaboratoreId", "==", collaboratoreId),
    );

    const snapshot = await getDocs(q);

    const assignments = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    })) as JobCollaboratoreAssignment[];

    return assignments.sort((a, b) => {
      const timeA = a.dataRichiesta?.toMillis() || 0;
      const timeB = b.dataRichiesta?.toMillis() || 0;
      return timeB - timeA;
    });
  } catch (error) {
    console.error("❌ Errore get collaboratore assignments:", error);
    throw error;
  }
}

/**
 * Rispondi a un assignment
 */
export async function respondToAssignment(
  assignmentId: string,
  status: "accepted" | "declined",
  noteRifiuto?: string,
): Promise<void> {
  try {
    const updateData: any = {
      status,
      dataRisposta: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    if (noteRifiuto) updateData.noteRifiuto = noteRifiuto;

    await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId), updateData);

    console.log("✅ Risposta assegnazione registrata:", assignmentId, status);
  } catch (error) {
    console.error("❌ Errore risposta assegnazione:", error);
    throw error;
  }
}

/**
 * Segna assignment come pagato
 */
export async function markAssignmentAsPaid(
  assignmentId: string,
): Promise<void> {
  try {
    await updateDoc(doc(db, ASSIGNMENTS_COLLECTION, assignmentId), {
      isPagato: true,
      dataPagamento: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    console.log("✅ Assegnazione segnata come pagata:", assignmentId);
  } catch (error) {
    console.error("❌ Errore mark as paid:", error);
    throw error;
  }
}

/**
 * Stats collaboratore
 */
export async function getCollaboratoreStats(
  collaboratoreId: string,
): Promise<CollaboratoreStats> {
  try {
    const assignments = await getCollaboratoreAssignments(collaboratoreId);

    return {
      totalJobs: assignments.length,
      jobsAccepted: assignments.filter((a) => a.status === "accepted").length,
      jobsDeclined: assignments.filter((a) => a.status === "declined").length,
      jobsPending: assignments.filter((a) => a.status === "pending").length,
      totalEarnings: assignments
        .filter((a) => a.status === "accepted")
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPaid: assignments
        .filter((a) => a.status === "accepted" && a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0),
      earningsPending: assignments
        .filter((a) => a.status === "accepted" && !a.isPagato)
        .reduce((sum, a) => sum + a.compenso, 0),
    };
  } catch (error) {
    console.error("❌ Errore get stats:", error);
    throw error;
  }
}

/**
 * Aggiungi pagamento
 */
export async function addPaymentToAssignment(
  assignmentId: string,
  data: {
    importo: number;
    tipo: CollaboratorPaymentType;
    metodo: PaymentMethod;
    note?: string;
    data?: string;
  },
): Promise<void> {
  try {
    const response = await apiRequest(
      "POST",
      `/api/collaboratori/assignments/${assignmentId}/add-payment`,
      data,
    );

    if (!response.ok) throw new Error("Errore registrazione pagamento");

    console.log("✅ Pagamento registrato:", assignmentId);
  } catch (error) {
    console.error("❌ Errore add payment:", error);
    throw error;
  }
}

/**
 * Get collaboratore by dashboard token
 */
export async function getCollaboratorByToken(token: string) {
  try {
    const response = await apiRequest(
      "GET",
      `/api/collaboratori/dashboard/${token}`,
    );

    if (!response.ok) return null;

    return await response.json();
  } catch (error) {
    console.error("❌ Errore get collaborator by token:", error);
    return null;
  }
}

/**
 * Genera link dashboard collaboratore
 */
export function generateDashboardLink(collaboratore: Collaboratore): string {
  if (!collaboratore.dashboardToken) return "";
  const baseUrl = window.location.origin;
  return `${baseUrl}/collaboratori/dashboard/${collaboratore.dashboardToken}`;
}

/**
 * Rigenera token dashboard collaboratore
 */
export async function regenerateDashboardToken(collaboratoreId: string): Promise<string | null> {
  try {
    const response = await apiRequest(
      "POST",
      `/api/collaboratori/${collaboratoreId}/regenerate-token`
    );

    if (!response.ok) throw new Error("Errore rigenerazione token");

    const data = await response.json();
    console.log("✅ Token rigenerato:", collaboratoreId);
    return data.dashboardToken;
  } catch (error) {
    console.error("❌ Errore regenerate token:", error);
    throw error;
  }
}

/**
 * Accetta/rifiuta assegnazione da dashboard pubblica
 */
export async function respondToAssignmentPublic(
  assignmentId: string,
  action: 'accept' | 'decline',
  noteRifiuto?: string
): Promise<void> {
  try {
    const response = await apiRequest(
      "POST",
      `/api/collaboratori/public/assignment/${assignmentId}/${action}`,
      action === 'decline' ? { noteRifiuto } : undefined
    );

    if (!response.ok) throw new Error(`Errore ${action} assegnazione`);

    console.log(`✅ Assegnazione ${action}:`, assignmentId);
  } catch (error) {
    console.error(`❌ Errore ${action} assegnazione:`, error);
    throw error;
  }
}

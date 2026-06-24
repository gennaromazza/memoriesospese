/**
 * LABORATORI LIBRARY - CRUD Operations
 * Gestione anagrafica laboratori di stampa via API backend
 */

import { apiRequest } from "./queryClient";
import type { Lab, InsertLab, UpdateLab } from "@shared/lab-types";

/**
 * Get tutti i laboratori
 */
export async function getAllLabs(attiviOnly = false): Promise<Lab[]> {
  try {
    const url = attiviOnly ? "/api/labs?attiviOnly=true" : "/api/labs";

    const response = await apiRequest("GET", url);

    if (!response.ok) throw new Error("Errore caricamento laboratori");

    return await response.json();
  } catch (error) {
    console.error("❌ Errore get laboratori:", error);
    throw error;
  }
}

/**
 * Crea nuovo laboratorio
 */
export async function createLab(data: InsertLab): Promise<string> {
  try {
    const response = await apiRequest("POST", "/api/labs", data);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore creazione laboratorio");
    }

    const result = await response.json();
    console.log("✅ Laboratorio creato:", result.id);
    return result.id;
  } catch (error) {
    console.error("❌ Errore creazione laboratorio:", error);
    throw error;
  }
}

/**
 * Update laboratorio
 */
export async function updateLab(id: string, data: UpdateLab): Promise<void> {
  try {
    const response = await apiRequest("PATCH", `/api/labs/${id}`, data);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore aggiornamento laboratorio");
    }

    console.log("✅ Laboratorio aggiornato:", id);
  } catch (error) {
    console.error("❌ Errore update laboratorio:", error);
    throw error;
  }
}

/**
 * Elimina laboratorio
 */
export async function deleteLab(id: string): Promise<void> {
  try {
    const response = await apiRequest("DELETE", `/api/labs/${id}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Errore eliminazione laboratorio");
    }

    console.log("✅ Laboratorio eliminato:", id);
  } catch (error) {
    console.error("❌ Errore eliminazione laboratorio:", error);
    throw error;
  }
}

/**
 * Funzioni Firebase per gestione Prodotti e Categorie
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import type { Product, InsertProduct, ProductCategory } from '@shared/booking-types';
import type { BenefitRule } from '@shared/quote-benefits';
import {
  getProductCategories,
  getActiveProductCategories,
  createProductCategory,
  updateProductCategory,
  deleteProductCategory,
  reorderProductCategories,
  toggleProductCategoryStatus
} from './product-categories';

const PRODUCTS_COLLECTION = 'products';

/**
 * Ottiene tutti i prodotti, ordinati per displayOrder (con fallback a createdAt)
 */
export async function getAllProducts(): Promise<Product[]> {
  const snapshot = await getDocs(collection(db, PRODUCTS_COLLECTION));
  
  const products = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Product));
  
  // Sort client-side: displayOrder asc (products without displayOrder go last), then createdAt desc
  return products.sort((a, b) => {
    const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
    if (orderA !== orderB) return orderA - orderB;
    // Fallback to createdAt desc
    const dateA = a.createdAt?.toMillis?.() ?? 0;
    const dateB = b.createdAt?.toMillis?.() ?? 0;
    return dateB - dateA;
  });
}

/**
 * Ottiene un singolo prodotto per ID
 */
export async function getProductById(id: string): Promise<Product | null> {
  const docRef = doc(db, PRODUCTS_COLLECTION, id);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) return null;
  
  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as Product;
}

/**
 * Crea un nuovo prodotto
 */
export async function createProduct(data: InsertProduct): Promise<string> {
  // Calcola prezzo finale
  const prezzoFinale = data.prezzo - (data.prezzo * data.sconto / 100);
  
  const docRef = await addDoc(collection(db, PRODUCTS_COLLECTION), {
    ...data,
    immagini: data.immagini || [], // Array vuoto se non fornito
    prezzoFinale,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  return docRef.id;
}

const BENEFIT_RULES_BATCH_SIZE = 499; // Firestore batch limit is 500 ops

type BenefitRuleCollection = 'quotes' | 'quoteTemplates';

function replaceNameInArray(arr: string[], oldName: string, newName: string): { updated: string[]; changed: boolean } {
  let changed = false;
  const updated = arr.map(name => {
    if (name === oldName) { changed = true; return newName; }
    return name;
  });
  return { updated, changed };
}

function renameBenefitRuleNames(rule: BenefitRule, oldName: string, newName: string): { rule: BenefitRule; changed: boolean } {
  let changed = false;
  let updated: BenefitRule = { ...rule };

  if (Array.isArray(rule.benefitProductNames)) {
    const result = replaceNameInArray(rule.benefitProductNames, oldName, newName);
    if (result.changed) { updated = { ...updated, benefitProductNames: result.updated }; changed = true; }
  }
  if (Array.isArray(rule.requiredProductNames)) {
    const result = replaceNameInArray(rule.requiredProductNames, oldName, newName);
    if (result.changed) { updated = { ...updated, requiredProductNames: result.updated }; changed = true; }
  }
  return { rule: updated, changed };
}

/**
 * Aggiorna in batch (chunked, max 499 ops/batch) tutti i preventivi e template
 * che referenziano oldName nelle BenefitRule.
 *
 * La cascade viene eseguita PRIMA del rename del prodotto: se fallisce prima di
 * qualunque commit, il prodotto non viene rinominato (consistenza garantita).
 * In scenari con >499 documenti (multi-chunk), un fallimento su un chunk tardivo
 * può lasciare una parte dei documenti già aggiornati — in tal caso il prodotto
 * non viene rinominato e la cascade parziale è loggoata per eventuale recovery.
 */
async function renameBenefitProductNameInRules(oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return;

  type PendingUpdate = { collectionName: BenefitRuleCollection; docId: string; benefitRules: BenefitRule[] };
  const updates: PendingUpdate[] = [];

  const processCollection = async (collectionName: BenefitRuleCollection) => {
    const snapshot = await getDocs(collection(db, collectionName));
    for (const docSnap of snapshot.docs) {
      const docData = docSnap.data() as { benefitRules?: BenefitRule[] };
      const rules = docData.benefitRules;
      if (!Array.isArray(rules) || rules.length === 0) continue;

      let docChanged = false;
      const updatedRules = rules.map(rule => {
        const { rule: updated, changed } = renameBenefitRuleNames(rule, oldName, newName);
        if (changed) docChanged = true;
        return updated;
      });

      if (docChanged) updates.push({ collectionName, docId: docSnap.id, benefitRules: updatedRules });
    }
  };

  await Promise.all([processCollection('quotes'), processCollection('quoteTemplates')]);

  if (updates.length === 0) return;

  // Commit in chunk da max BENEFIT_RULES_BATCH_SIZE per rispettare il limite Firestore
  const totalChunks = Math.ceil(updates.length / BENEFIT_RULES_BATCH_SIZE);
  for (let i = 0; i < updates.length; i += BENEFIT_RULES_BATCH_SIZE) {
    const chunkIndex = Math.floor(i / BENEFIT_RULES_BATCH_SIZE) + 1;
    const chunk = updates.slice(i, i + BENEFIT_RULES_BATCH_SIZE);
    const batch = writeBatch(db);
    for (const { collectionName, docId, benefitRules } of chunk) {
      batch.update(doc(db, collectionName, docId), { benefitRules });
    }
    try {
      await batch.commit();
    } catch (err) {
      const committedDocs = updates.slice(0, i).map(u => `${u.collectionName}/${u.docId}`);
      const pendingDocs = updates.slice(i).map(u => `${u.collectionName}/${u.docId}`);
      console.error(
        `[renameBenefitProductName] ERRORE chunk ${chunkIndex}/${totalChunks} "${oldName}" → "${newName}".\n` +
        `Già aggiornati (${committedDocs.length}): ${committedDocs.join(', ') || 'nessuno'}\n` +
        `Non aggiornati (${pendingDocs.length}): ${pendingDocs.join(', ')}`,
        err
      );
      throw err;
    }
  }

  console.log(`[renameBenefitProductName] Aggiornati ${updates.length} documenti: "${oldName}" → "${newName}"`);
}

/**
 * Aggiorna un prodotto esistente.
 * Se il nome cambia, aggiorna PRIMA le BenefitRule in quotes e quoteTemplates;
 * solo se la cascade riesce, procede con il rename del prodotto in Firestore.
 */
export async function updateProduct(id: string, data: Partial<InsertProduct>): Promise<void> {
  const docRef = doc(db, PRODUCTS_COLLECTION, id);

  // Leggi sempre il doc corrente: serve per prezzo/sconto E per rilevare cambio nome
  const currentDoc = await getDoc(docRef);
  const currentData = currentDoc.exists() ? currentDoc.data() as { nome?: string; prezzo?: number; sconto?: number } : null;

  // Se il nome cambia, esegui la cascade PRIMA di aggiornare il prodotto.
  // In caso di errore nella cascade, l'eccezione si propaga e il prodotto non viene rinominato.
  if (data.nome && currentData?.nome && data.nome !== currentData.nome) {
    await renameBenefitProductNameInRules(currentData.nome, data.nome);
  }

  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.prezzo !== undefined || data.sconto !== undefined) {
    const prezzo = data.prezzo ?? currentData?.prezzo ?? 0;
    const sconto = data.sconto ?? currentData?.sconto ?? 0;
    updateData.prezzoFinale = prezzo - (prezzo * sconto / 100);
  }

  await updateDoc(docRef, updateData);
}

/**
 * Elimina un prodotto
 */
export async function deleteProduct(id: string): Promise<void> {
  const docRef = doc(db, PRODUCTS_COLLECTION, id);
  await deleteDoc(docRef);
}

/**
 * Ottiene solo prodotti attivi
 */
export async function getActiveProducts(): Promise<Product[]> {
  const allProducts = await getAllProducts();
  return allProducts.filter(p => p.attivo);
}

/**
 * Riordina prodotti tramite drag-and-drop
 * @param reorderedIds Array di product IDs nell'ordine desiderato
 */
export async function reorderProducts(reorderedIds: string[]): Promise<void> {
  const batch = writeBatch(db);
  const now = Timestamp.now();
  
  reorderedIds.forEach((id, index) => {
    const docRef = doc(db, PRODUCTS_COLLECTION, id);
    batch.update(docRef, {
      displayOrder: index + 1,
      updatedAt: now
    });
  });
  
  await batch.commit();
}

/**
 * ========================================
 * REACT QUERY HOOKS PER PRODUCT CATEGORIES
 * ========================================
 */

export function useProductCategories() {
  return useQuery<ProductCategory[]>({
    queryKey: ['productCategories'],
    queryFn: getProductCategories
  });
}

export function useActiveProductCategories() {
  return useQuery<ProductCategory[]>({
    queryKey: ['activeProductCategories'],
    queryFn: getActiveProductCategories
  });
}

export function useCreateProductCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: createProductCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      queryClient.invalidateQueries({ queryKey: ['activeProductCategories'] });
    }
  });
}

export function useUpdateProductCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductCategory> }) => 
      updateProductCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      queryClient.invalidateQueries({ queryKey: ['activeProductCategories'] });
    }
  });
}

export function useDeleteProductCategory() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: deleteProductCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      queryClient.invalidateQueries({ queryKey: ['activeProductCategories'] });
    }
  });
}

export function useToggleProductCategoryStatus() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: toggleProductCategoryStatus,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      queryClient.invalidateQueries({ queryKey: ['activeProductCategories'] });
    }
  });
}

export function useReorderProductCategories() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: reorderProductCategories,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['productCategories'] });
      queryClient.invalidateQueries({ queryKey: ['activeProductCategories'] });
    }
  });
}

/**
 * ========================================
 * REACT QUERY HOOKS PER PRODUCTS
 * ========================================
 */

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: getAllProducts
  });
}

export function useReorderProducts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: reorderProducts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    }
  });
}

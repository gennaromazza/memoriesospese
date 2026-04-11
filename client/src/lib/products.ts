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

/**
 * Aggiorna in batch tutti i preventivi e template che referenziano oldName
 * nelle BenefitRule (benefitProductNames[] e requiredProductNames[]).
 * Chiamata automaticamente da updateProduct() quando il nome del prodotto cambia.
 */
async function renameBenefitProductNameInRules(oldName: string, newName: string): Promise<void> {
  if (!oldName || !newName || oldName === newName) return;

  const batch = writeBatch(db);
  let updatedCount = 0;

  const replaceInArray = (arr: string[]): { updated: string[]; changed: boolean } => {
    let changed = false;
    const updated = arr.map(name => {
      if (name === oldName) { changed = true; return newName; }
      return name;
    });
    return { updated, changed };
  };

  const processSnapshot = async (collectionName: string) => {
    const snapshot = await getDocs(collection(db, collectionName));
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const rules: any[] = data.benefitRules;
      if (!Array.isArray(rules) || rules.length === 0) continue;

      let docChanged = false;
      const updatedRules = rules.map((rule: any) => {
        let ruleChanged = false;
        let updatedRule = { ...rule };

        if (Array.isArray(rule.benefitProductNames)) {
          const { updated, changed } = replaceInArray(rule.benefitProductNames);
          if (changed) { updatedRule.benefitProductNames = updated; ruleChanged = true; }
        }
        if (Array.isArray(rule.requiredProductNames)) {
          const { updated, changed } = replaceInArray(rule.requiredProductNames);
          if (changed) { updatedRule.requiredProductNames = updated; ruleChanged = true; }
        }
        if (ruleChanged) docChanged = true;
        return updatedRule;
      });

      if (docChanged) {
        batch.update(doc(db, collectionName, docSnap.id), { benefitRules: updatedRules });
        updatedCount++;
      }
    }
  };

  await Promise.all([
    processSnapshot('quotes'),
    processSnapshot('quoteTemplates'),
  ]);

  if (updatedCount > 0) {
    await batch.commit();
    console.log(`[renameBenefitProductName] Aggiornati ${updatedCount} documenti: "${oldName}" → "${newName}"`);
  }
}

/**
 * Aggiorna un prodotto esistente.
 * Se il nome cambia, aggiorna automaticamente le BenefitRule in quotes e quoteTemplates.
 */
export async function updateProduct(id: string, data: Partial<InsertProduct>): Promise<void> {
  const docRef = doc(db, PRODUCTS_COLLECTION, id);

  // Leggi sempre il doc corrente: serve per prezzo/sconto E per rilevare cambio nome
  const currentDoc = await getDoc(docRef);
  const currentData = currentDoc.exists() ? currentDoc.data() : null;

  let updateData: any = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  if (data.prezzo !== undefined || data.sconto !== undefined) {
    const prezzo = data.prezzo ?? currentData?.prezzo ?? 0;
    const sconto = data.sconto ?? currentData?.sconto ?? 0;
    updateData.prezzoFinale = prezzo - (prezzo * sconto / 100);
  }

  await updateDoc(docRef, updateData);

  // Cascade: aggiorna BenefitRule se il nome è cambiato
  if (data.nome && currentData?.nome && data.nome !== currentData.nome) {
    await renameBenefitProductNameInRules(currentData.nome, data.nome);
  }
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

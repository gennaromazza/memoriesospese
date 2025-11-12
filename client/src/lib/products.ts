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
 * Ottiene tutti i prodotti
 */
export async function getAllProducts(): Promise<Product[]> {
  const q = query(collection(db, PRODUCTS_COLLECTION), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Product));
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
 * Aggiorna un prodotto esistente
 */
export async function updateProduct(id: string, data: Partial<InsertProduct>): Promise<void> {
  const docRef = doc(db, PRODUCTS_COLLECTION, id);
  
  // Se prezzo o sconto cambiano, ricalcola prezzoFinale
  let updateData: any = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  
  if (data.prezzo !== undefined || data.sconto !== undefined) {
    // Ottieni dati correnti per calcolo
    const currentDoc = await getDoc(docRef);
    if (currentDoc.exists()) {
      const currentData = currentDoc.data();
      const prezzo = data.prezzo ?? currentData.prezzo;
      const sconto = data.sconto ?? currentData.sconto;
      updateData.prezzoFinale = prezzo - (prezzo * sconto / 100);
    }
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

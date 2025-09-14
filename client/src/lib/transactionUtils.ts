/**
 * Transaction Utilities for Atomic Database Operations
 * Ensures data consistency across multiple Firestore operations
 */

import { 
  doc, 
  updateDoc, 
  setDoc, 
  deleteDoc, 
  runTransaction, 
  Transaction,
  DocumentReference,
  DocumentData 
} from 'firebase/firestore';
import { db } from './firebase';

export interface TransactionOperation {
  type: 'set' | 'update' | 'delete';
  ref: DocumentReference<DocumentData>;
  data?: any;
}

export interface TransactionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  rollbackData?: any;
}

/**
 * Esegue operazioni multiple in transazione atomica
 */
export async function executeAtomicTransaction<T = any>(
  operations: TransactionOperation[],
  onSuccess?: (transaction: Transaction) => Promise<T>,
  onError?: (error: Error) => Promise<void>
): Promise<TransactionResult<T>> {
  try {
    const result = await runTransaction(db, async (transaction) => {
      // Esegui tutte le operazioni nella transazione
      for (const operation of operations) {
        switch (operation.type) {
          case 'set':
            if (!operation.data) {
              throw new Error(`Set operation requires data for ${operation.ref.path}`);
            }
            transaction.set(operation.ref, operation.data);
            break;
            
          case 'update':
            if (!operation.data) {
              throw new Error(`Update operation requires data for ${operation.ref.path}`);
            }
            transaction.update(operation.ref, operation.data);
            break;
            
          case 'delete':
            transaction.delete(operation.ref);
            break;
            
          default:
            throw new Error(`Unknown operation type: ${(operation as any).type}`);
        }
      }

      // Esegui callback di successo se fornito
      if (onSuccess) {
        return await onSuccess(transaction);
      }
      
      return undefined as T;
    });

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('🔴 Transaction failed:', error);
    
    // Esegui callback di errore se fornito
    if (onError && error instanceof Error) {
      try {
        await onError(error);
      } catch (callbackError) {
        console.error('🔴 Error callback failed:', callbackError);
      }
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown transaction error'
    };
  }
}

/**
 * Crea operazione di set per transazione
 */
export function createSetOperation(
  ref: DocumentReference<DocumentData>, 
  data: any
): TransactionOperation {
  return {
    type: 'set',
    ref,
    data
  };
}

/**
 * Crea operazione di update per transazione
 */
export function createUpdateOperation(
  ref: DocumentReference<DocumentData>, 
  data: any
): TransactionOperation {
  return {
    type: 'update',
    ref,
    data
  };
}

/**
 * Crea operazione di delete per transazione
 */
export function createDeleteOperation(
  ref: DocumentReference<DocumentData>
): TransactionOperation {
  return {
    type: 'delete',
    ref
  };
}

/**
 * Utility per retry di transazioni con backoff exponential
 */
export async function retryTransaction<T>(
  transactionFn: () => Promise<TransactionResult<T>>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<TransactionResult<T>> {
  let lastError: string = '';
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await transactionFn();
      
      if (result.success) {
        return result;
      }
      
      lastError = result.error || 'Unknown error';
      
      // Se non è l'ultimo tentativo, aspetta prima di retry
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.warn(`🔄 Transaction attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unexpected error';
      console.error(`🔴 Transaction attempt ${attempt} threw error:`, error);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  return {
    success: false,
    error: `Transaction failed after ${maxRetries} attempts. Last error: ${lastError}`
  };
}
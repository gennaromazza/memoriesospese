/**
 * Locking Utilities for Race Condition Prevention
 * Prevents simultaneous operations on the same resource
 */

import { 
  doc, 
  setDoc, 
  deleteDoc, 
  getDoc, 
  serverTimestamp,
  DocumentReference 
} from 'firebase/firestore';
import { db } from './firebase';

export interface LockInfo {
  id: string;
  resourceId: string;
  operation: string;
  acquiredAt: any; // Firebase Timestamp
  expiresAt: number;
  ownerId: string;
}

const LOCK_TIMEOUT = 30 * 1000; // 30 secondi
const LOCK_RETRY_INTERVAL = 100; // 100ms
const MAX_LOCK_ATTEMPTS = 100; // Max 10 secondi di attesa

/**
 * Classe per gestire lock distribuiti con Firestore
 */
export class DistributedLock {
  private lockId: string;
  private resourceId: string;
  private operation: string;
  private ownerId: string;
  private lockRef: DocumentReference;

  constructor(resourceId: string, operation: string) {
    this.resourceId = resourceId;
    this.operation = operation;
    this.ownerId = this.generateOwnerId();
    this.lockId = `${resourceId}_${operation}`;
    this.lockRef = doc(db, 'distributedLocks', this.lockId);
  }

  /**
   * Acquisisce il lock per la risorsa
   */
  async acquire(): Promise<boolean> {
    let attempts = 0;

    while (attempts < MAX_LOCK_ATTEMPTS) {
      try {
        // Controlla se esiste già un lock
        const existingLock = await getDoc(this.lockRef);
        
        if (existingLock.exists()) {
          const lockData = existingLock.data() as LockInfo;
          
          // Se il lock è scaduto, rimuovilo
          if (Date.now() > lockData.expiresAt) {
            await this.forceRelease();
          } else {
            // Lock ancora valido, aspetta e riprova
            attempts++;
            await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL));
            continue;
          }
        }

        // Tenta di acquisire il lock
        const lockInfo: LockInfo = {
          id: this.lockId,
          resourceId: this.resourceId,
          operation: this.operation,
          acquiredAt: serverTimestamp(),
          expiresAt: Date.now() + LOCK_TIMEOUT,
          ownerId: this.ownerId
        };

        await setDoc(this.lockRef, lockInfo);
        
        // Verifica che siamo effettivamente proprietari del lock
        const verifyLock = await getDoc(this.lockRef);
        if (verifyLock.exists() && verifyLock.data().ownerId === this.ownerId) {
          console.log(`🔒 Lock acquired for ${this.resourceId}:${this.operation}`);
          return true;
        }

        // Qualcun altro ha acquisito il lock nel frattempo
        attempts++;
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL));
        
      } catch (error) {
        console.error(`🔴 Error acquiring lock for ${this.lockId}:`, error);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_INTERVAL));
      }
    }

    console.warn(`⚠️ Failed to acquire lock for ${this.lockId} after ${MAX_LOCK_ATTEMPTS} attempts`);
    return false;
  }

  /**
   * Rilascia il lock
   */
  async release(): Promise<boolean> {
    try {
      // Verifica di essere proprietario del lock
      const lockDoc = await getDoc(this.lockRef);
      
      if (!lockDoc.exists()) {
        console.warn(`⚠️ Lock ${this.lockId} does not exist`);
        return true; // Considera rilasciato se non esiste
      }

      const lockData = lockDoc.data() as LockInfo;
      
      if (lockData.ownerId !== this.ownerId) {
        console.error(`🔴 Cannot release lock ${this.lockId}: not owner`);
        return false;
      }

      await deleteDoc(this.lockRef);
      console.log(`🔓 Lock released for ${this.resourceId}:${this.operation}`);
      return true;
      
    } catch (error) {
      console.error(`🔴 Error releasing lock ${this.lockId}:`, error);
      return false;
    }
  }

  /**
   * Forza il rilascio del lock (per cleanup)
   */
  async forceRelease(): Promise<void> {
    try {
      await deleteDoc(this.lockRef);
      console.log(`🔓 Force released lock ${this.lockId}`);
    } catch (error) {
      console.error(`🔴 Error force releasing lock ${this.lockId}:`, error);
    }
  }

  /**
   * Esegue operazione con lock automatico
   */
  async withLock<T>(operation: () => Promise<T>): Promise<T | null> {
    const acquired = await this.acquire();
    
    if (!acquired) {
      throw new Error(`Cannot acquire lock for ${this.resourceId}:${this.operation}`);
    }

    try {
      const result = await operation();
      return result;
    } finally {
      await this.release();
    }
  }

  /**
   * Genera ID univoco per il proprietario del lock
   */
  private generateOwnerId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}

/**
 * Utility per eseguire operazione con lock automatico
 */
export async function withDistributedLock<T>(
  resourceId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const lock = new DistributedLock(resourceId, operation);
  const result = await lock.withLock(fn);
  
  if (result === null) {
    throw new Error(`Failed to execute operation with lock: ${resourceId}:${operation}`);
  }
  
  return result;
}

/**
 * Cleanup di tutti i lock scaduti (da chiamare periodicamente)
 */
export async function cleanupExpiredLocks(): Promise<number> {
  try {
    const { collection, query, where, getDocs } = await import('firebase/firestore');
    
    const locksQuery = query(
      collection(db, 'distributedLocks'),
      where('expiresAt', '<', Date.now())
    );
    
    const snapshot = await getDocs(locksQuery);
    let cleaned = 0;
    
    for (const doc of snapshot.docs) {
      try {
        await deleteDoc(doc.ref);
        cleaned++;
      } catch (error) {
        console.error(`🔴 Error cleaning expired lock ${doc.id}:`, error);
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired locks`);
    }
    
    return cleaned;
  } catch (error) {
    console.error('🔴 Error during lock cleanup:', error);
    return 0;
  }
}
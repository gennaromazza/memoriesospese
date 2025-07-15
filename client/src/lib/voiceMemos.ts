/**
 * Firebase Voice Memos Service
 * Gestisce registrazioni vocali con upload su Firebase Storage
 */

import { 
  collection, 
  addDoc, 
  getDocs, 
  updateDoc,
  deleteDoc,
  doc,
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  onSnapshot,
  limit,
  getDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase';

export interface VoiceMemo {
  id: string;
  galleryId: string;
  guestName: string;
  userEmail?: string;
  userProfileImageUrl?: string;
  audioUrl: string;
  message?: string;
  unlockDate?: string; // ISO string date
  fileName: string;
  fileSize: number;
  duration?: number; // in seconds
  isUnlocked: boolean;
  createdAt: any; // Firebase Timestamp
}

export interface VoiceMemoData {
  galleryId: string;
  guestName: string;
  userEmail?: string;
  userProfileImageUrl?: string;
  message?: string;
  duration?: number;
  unlockDelayMinutes?: number;
}

export class VoiceMemoService {
  /**
   * Carica voice memo su Firebase Storage e salva metadata
   */
  static async uploadVoiceMemo(
    audioBlob: Blob,
    memoData: VoiceMemoData
  ): Promise<string> {
    try {
      const { galleryId, guestName, userEmail, userProfileImageUrl, message, duration, unlockDelayMinutes = 60 } = memoData;

      // Genera nome file unico
      const timestamp = Date.now();
      const fileName = `voice-memos/${galleryId}/${timestamp}-${guestName}.wav`;
      
      // Upload audio to Firebase Storage
      const storageRef = ref(storage, fileName);
      await uploadBytes(storageRef, audioBlob);
      const audioUrl = await getDownloadURL(storageRef);

      // Calcola tempo di sblocco
      const unlockDate = new Date(Date.now() + unlockDelayMinutes * 60 * 1000).toISOString();

      // Salva metadata in Firestore
      const docRef = await addDoc(collection(db, 'voiceMemos'), {
        galleryId,
        guestName,
        userEmail,
        userProfileImageUrl,
        audioUrl,
        message,
        unlockDate,
        fileName,
        fileSize: audioBlob.size,
        duration,
        isUnlocked: false,
        createdAt: serverTimestamp()
      });

      return docRef.id;
    } catch (error) {
      console.error('Errore upload voice memo:', error);
      throw error;
    }
  }

  /**
   * Ottieni voice memos per una galleria
   */
  static async getGalleryVoiceMemos(galleryId: string, limitCount?: number): Promise<VoiceMemo[]> {
    try {
      let memosQuery = query(
        collection(db, 'voiceMemos'),
        where('galleryId', '==', galleryId),
        orderBy('createdAt', 'desc')
      );

      if (limitCount) {
        memosQuery = query(memosQuery, limit(limitCount));
      }
      
      const snapshot = await getDocs(memosQuery);
      
      return snapshot.docs.map(doc => {
        const data = doc.data();
        const memo = { id: doc.id, ...data } as VoiceMemo;
        
        // Controlla se dovrebbe essere sbloccato
        if (!memo.isUnlocked && memo.unlockDate && new Date() >= new Date(memo.unlockDate)) {
          memo.isUnlocked = true;
          // Aggiorna in background
          this.updateUnlockStatus(memo.id).catch(console.error);
        }
        
        return memo;
      });
    } catch (error) {
      console.error('Errore recupero voice memos galleria:', error);
      return [];
    }
  }

  /**
   * Ottieni voice memos per un utente
   */
  static async getUserVoiceMemos(userEmail: string): Promise<VoiceMemo[]> {
    try {
      const memosQuery = query(
        collection(db, 'voiceMemos'),
        where('userEmail', '==', userEmail),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(memosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoiceMemo));
    } catch (error) {
      console.error('Errore recupero voice memos utente:', error);
      return [];
    }
  }

  /**
   * Elimina voice memo (file Storage + documento Firestore)
   */
  static async deleteVoiceMemo(memoId: string): Promise<void> {
    try {
      // Ottieni info del memo
      const memoDoc = doc(db, 'voiceMemos', memoId);
      const memoSnapshot = await getDoc(memoDoc);
      
      if (memoSnapshot.exists()) {
        const memoData = memoSnapshot.data() as VoiceMemo;
        
        // Elimina file da Storage
        if (memoData.fileName) {
          const storageRef = ref(storage, memoData.fileName);
          await deleteObject(storageRef);
        }
        
        // Elimina documento da Firestore
        await deleteDoc(memoDoc);
      }
    } catch (error) {
      console.error('Errore eliminazione voice memo:', error);
      throw error;
    }
  }

  /**
   * Aggiorna stato di sblocco
   */
  static async updateUnlockStatus(memoId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'voiceMemos', memoId), {
        isUnlocked: true
      });
    } catch (error) {
      console.error('Errore aggiornamento stato sblocco:', error);
    }
  }

  /**
   * Conta voice memos per una galleria
   */
  static async getGalleryVoiceMemosCount(galleryId: string): Promise<number> {
    try {
      const memosQuery = query(
        collection(db, 'voiceMemos'),
        where('galleryId', '==', galleryId)
      );
      
      const snapshot = await getDocs(memosQuery);
      return snapshot.docs.length;
    } catch (error) {
      console.error('Errore conteggio voice memos galleria:', error);
      return 0;
    }
  }

  /**
   * Ottieni voice memos sbloccati per una galleria
   */
  static async getUnlockedVoiceMemos(galleryId: string): Promise<VoiceMemo[]> {
    try {
      const memosQuery = query(
        collection(db, 'voiceMemos'),
        where('galleryId', '==', galleryId),
        where('isUnlocked', '==', true),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(memosQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoiceMemo));
    } catch (error) {
      console.error('Errore recupero voice memos sbloccati:', error);
      return [];
    }
  }

  /**
   * Real-time subscription ai voice memos di una galleria
   */
  static subscribeToGalleryVoiceMemos(galleryId: string, callback: (memos: VoiceMemo[]) => void) {
    const q = query(
      collection(db, 'voiceMemos'),
      where('galleryId', '==', galleryId),
      orderBy('createdAt', 'desc')
    );
    
    return onSnapshot(q, (snapshot) => {
      const memos = snapshot.docs.map(doc => {
        const data = doc.data();
        const memo = { id: doc.id, ...data } as VoiceMemo;
        
        // Controlla se dovrebbe essere sbloccato
        if (!memo.isUnlocked && memo.unlockDate && new Date() >= new Date(memo.unlockDate)) {
          memo.isUnlocked = true;
          // Aggiorna in background
          this.updateUnlockStatus(memo.id).catch(console.error);
        }
        
        return memo;
      });
      
      callback(memos);
    }, (error) => {
      console.error('Errore subscription voice memos galleria:', error);
      callback([]);
    });
  }

  /**
   * Controlla voice memos che dovrebbero essere sbloccati
   */
  static async checkAndUnlockMemos(): Promise<number> {
    try {
      const now = new Date();
      console.log('🔍 Controllo sblocchi automatici voice memos:', { now });
      
      // Ottieni tutti i voice memos senza filtri per evitare problemi con indici Firebase
      const memosQuery = query(collection(db, 'voiceMemos'));
      
      const snapshot = await getDocs(memosQuery);
      console.log('🔍 Voice memos totali trovati:', { count: snapshot.docs.length });
      
      // Filtra lato client per trovare quelli da sbloccare
      const memosToUnlock = snapshot.docs.filter(doc => {
        const data = doc.data();
        
        // Controlla se è già sbloccato
        if (data.isUnlocked === true) return false;
        
        const unlockDate = data.unlockDate || data.unlockAt || data.unlockTime;
        
        if (!unlockDate) return false;
        
        // Converti la data di sblocco in Date object
        let unlockDateObj: Date;
        if (unlockDate.toDate) {
          unlockDateObj = unlockDate.toDate();
        } else if (unlockDate.seconds) {
          unlockDateObj = new Date(unlockDate.seconds * 1000);
        } else {
          unlockDateObj = new Date(unlockDate);
        }
        
        return now >= unlockDateObj;
      });
      
      console.log('🔍 Voice memos da sbloccare:', { count: memosToUnlock.length });
      
      if (memosToUnlock.length > 0) {
        const unlockPromises = memosToUnlock.map(doc => 
          updateDoc(doc.ref, { isUnlocked: true })
        );
        
        await Promise.all(unlockPromises);
        console.log('✅ Voice memos sbloccati:', { count: memosToUnlock.length });
      }
      
      return memosToUnlock.length;
    } catch (error) {
      console.error('Errore sblocco automatico voice memos:', error);
      return 0;
    }
  }

  /**
   * Ottieni statistiche voice memos per admin
   */
  static async getVoiceMemosStats(): Promise<{
    total: number;
    unlocked: number;
    locked: number;
    todayCount: number;
    averageDuration: number;
  }> {
    try {
      // Total voice memos
      const totalSnapshot = await getDocs(collection(db, 'voiceMemos'));
      const total = totalSnapshot.docs.length;
      
      const allMemos = totalSnapshot.docs.map(doc => doc.data());
      
      // Unlocked vs locked
      const unlocked = allMemos.filter(memo => memo.isUnlocked).length;
      const locked = total - unlocked;
      
      // Today count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCount = allMemos.filter(memo => 
        memo.createdAt?.toDate() >= today
      ).length;
      
      // Average duration
      const totalDuration = allMemos.reduce((sum, memo) => sum + (memo.duration || 0), 0);
      const averageDuration = total > 0 ? totalDuration / total : 0;

      return {
        total,
        unlocked,
        locked,
        todayCount,
        averageDuration
      };
    } catch (error) {
      console.error('Errore recupero statistiche voice memos:', error);
      return { total: 0, unlocked: 0, locked: 0, todayCount: 0, averageDuration: 0 };
    }
  }
}

// Funzioni di convenienza per importazione diretta
export const getRecentVoiceMemos = (galleryId: string, limitCount: number = 5) => 
  VoiceMemoService.getGalleryVoiceMemos(galleryId, limitCount);

export default VoiceMemoService;
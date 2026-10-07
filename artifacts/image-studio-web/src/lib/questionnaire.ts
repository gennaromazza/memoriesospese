/**
 * Firebase Questionnaire Service
 * Gestisce operazioni CRUD per il sistema questionario coppie
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  runTransaction,
  deleteField
} from 'firebase/firestore';
import { db } from './firebase';
import {
  FaqSet,
  Questionnaire,
  QuestionnaireToken,
  AnswerDraft,
  AnswerSet,
  Role,
  QuestionKey,
  generateSecureToken,
  sha256Hash
} from '@shared/schema';
import { withDistributedLock } from './lockingUtils';
import { questionnaireLogger, tokenLogger, measurePerformance } from './loggingUtils';

export class QuestionnaireService {

  // ====== FAQ SETS MANAGEMENT ======

  /**
   * Ottieni tutti i set di domande
   */
  static async getAllFaqSets(): Promise<FaqSet[]> {
    try {
      const faqSetsQuery = query(
        collection(db, 'faqSets'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(faqSetsQuery);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FaqSet));
    } catch (error) {
      console.error('Errore recupero FAQ sets:', error);
      return [];
    }
  }

  /**
   * Ottieni set domande attivo
   */
  static async getActiveFaqSet(): Promise<FaqSet | null> {
    try {
      const activeQuery = query(
        collection(db, 'faqSets'),
        where('active', '==', true),
        limit(1)
      );
      const snapshot = await getDocs(activeQuery);
      return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as FaqSet;
    } catch (error) {
      console.error('Errore recupero FAQ set attivo:', error);
      return null;
    }
  }

  /**
   * Ottieni FAQ set per ID
   */
  static async getFaqSetById(id: string): Promise<FaqSet | null> {
    try {
      const faqSetRef = doc(db, 'faqSets', id);
      const faqSetDoc = await getDoc(faqSetRef);
      return faqSetDoc.exists() ? { id: faqSetDoc.id, ...faqSetDoc.data() } as FaqSet : null;
    } catch (error) {
      console.error('Errore recupero FAQ set:', error);
      return null;
    }
  }

  /**
   * Crea nuovo set di domande
   */
  static async createFaqSet(faqSet: Omit<FaqSet, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    try {
      const faqSetRef = doc(collection(db, 'faqSets'));
      const now = Date.now();

      await setDoc(faqSetRef, {
        ...faqSet,
        createdAt: now,
        updatedAt: now
      });

      return faqSetRef.id;
    } catch (error) {
      console.error('Errore creazione FAQ set:', error);
      throw new Error('Errore durante la creazione del set di domande');
    }
  }

  /**
   * Aggiorna set di domande
   */
  static async updateFaqSet(id: string, updates: Partial<FaqSet>): Promise<void> {
    try {
      const faqSetRef = doc(db, 'faqSets', id);
      await updateDoc(faqSetRef, {
        ...updates,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Errore aggiornamento FAQ set:', error);
      throw new Error('Errore durante l\'aggiornamento del set di domande');
    }
  }

  /**
   * Attiva set di domande (disattiva gli altri)
   * FIXED: Firestore-compliant - all reads before writes
   */
  static async activateFaqSet(id: string): Promise<void> {
    try {
      // First get all faq sets, then do transaction with writes only
      const allSetsQuery = query(collection(db, 'faqSets'));
      const allSetsSnapshot = await getDocs(allSetsQuery);
      
      await runTransaction(db, async (transaction) => {
        const now = Date.now();
        
        // All writes in transaction - no reads here
        allSetsSnapshot.docs.forEach(doc => {
          const isTarget = doc.id === id;
          transaction.update(doc.ref, { 
            active: isTarget, 
            updatedAt: now 
          });
        });
      });
    } catch (error) {
      console.error('Errore attivazione FAQ set:', error);
      throw new Error('Errore durante l\'attivazione del set di domande');
    }
  }

  /**
   * Elimina set di domande
   */
  static async deleteFaqSet(id: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'faqSets', id));
    } catch (error) {
      console.error('Errore eliminazione FAQ set:', error);
      throw new Error('Errore durante l\'eliminazione del set di domande');
    }
  }

  // ====== QUESTIONNAIRE MANAGEMENT ======

  /**
   * Crea questionario per una galleria
   */
  static async createQuestionnaire(
    galleryId: string,
    faqSetId: string,
    faqVersion: number,
    createdBy?: string
  ): Promise<string> {
    try {
      const questionnaireRef = doc(collection(db, 'galleries', galleryId, 'questionnaires'));
      const now = Date.now();

      const questionnaire: Omit<Questionnaire, 'id'> = {
        galleryId,
        faqSetId,
        faqVersion,
        enabled: false,
        couple: {
          brideName: '',
          groomName: '',
          weddingDate: '',
          emailBride: '',
          emailGroom: ''
        },
        tokens: {
          bride: { tokenId: '', url: '', createdAt: now, expiresAt: now },
          groom: { tokenId: '', url: '', createdAt: now, expiresAt: now }
        },
        activeTokens: {
          bride: '',
          groom: ''
        },
        status: {
          bride: {},
          groom: {}
        },
        createdAt: now,
        updatedAt: now,
        createdBy
      };

      await setDoc(questionnaireRef, questionnaire);
      return questionnaireRef.id;
    } catch (error) {
      console.error('Errore creazione questionario:', error);
      throw new Error('Errore durante la creazione del questionario');
    }
  }

  /**
   * Ottieni questionario di una galleria
   */
  static async getGalleryQuestionnaire(galleryId: string): Promise<Questionnaire | null> {
    try {
      const questionnairesQuery = query(
        collection(db, 'galleries', galleryId, 'questionnaires'),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      const snapshot = await getDocs(questionnairesQuery);
      return snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Questionnaire;
    } catch (error) {
      console.error('Errore recupero questionario galleria:', error);
      // Se il questionario non esiste o non è accessibile, ritorna null
      // Questo è normale per gallerie senza questionari configurati
      return null;
    }
  }

  /**
   * Abilita/disabilita questionario
   */
  static async toggleQuestionnaire(galleryId: string, questionnaireId: string, enabled: boolean): Promise<void> {
    try {
      const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
      await updateDoc(questionnaireRef, {
        enabled,
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Errore toggle questionario:', error);
      throw new Error('Errore durante l\'aggiornamento del questionario');
    }
  }

  /**
   * Aggiorna informazioni coppia
   */
  static async updateCoupleInfo(galleryId: string, questionnaireId: string, coupleInfo: any): Promise<void> {
    try {
      const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
      await updateDoc(questionnaireRef, {
        couple: {
          brideName: coupleInfo.brideName || '',
          groomName: coupleInfo.groomName || '',
          weddingDate: coupleInfo.weddingDate || '',
          emailBride: coupleInfo.emailBride || '',
          emailGroom: coupleInfo.emailGroom || ''
        },
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Errore aggiornamento informazioni coppia:', error);
      throw new Error('Errore durante l\'aggiornamento delle informazioni della coppia');
    }
  }

  // ====== TOKEN MANAGEMENT ======

  /**
   * Genera token sicuro per role specifico con transazioni atomiche
   * Previene race conditions e garantisce consistenza dati
   * FIRESTORE COMPLIANT: All READs before WRITEs, no queries in transaction
   */
  static async generateRoleToken(
    galleryId: string,
    questionnaireId: string,
    role: Role
  ): Promise<{ tokenId: string; url: string; createdAt: number; expiresAt: number }> {
    return await measurePerformance(tokenLogger, 'generateRoleToken', async () => {
      // STEP 1: Validation input
      if (!galleryId?.trim() || !questionnaireId?.trim() || !role?.trim()) {
        const error = new Error('Invalid input parameters: galleryId, questionnaireId, and role are required');
        tokenLogger.error('generateRoleToken', 'Token generation failed - invalid input', error, { 
          galleryId, 
          questionnaireId, 
          role
        });
        throw error;
      }

      const lockResourceId = `${galleryId}_${role}`;
      const operation = 'generateRoleToken';
      
      tokenLogger.info('generateRoleToken', 'Starting Firestore-compliant token generation', { 
        galleryId, 
        questionnaireId, 
        role,
        lockResourceId 
      });

      return await withDistributedLock(lockResourceId, operation, async () => {
        // STEP 2: Pre-generate all values for atomic transaction
        const rawToken = generateSecureToken();
        const tokenHash = await sha256Hash(rawToken);
        const tokenId = `${role}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
        const now = Date.now();
        const expiresAt = now + (90 * 24 * 60 * 60 * 1000); // 90 giorni

        // STEP 3: Prepare URL
        const { createAbsoluteUrl } = await import('./basePath');
        const url = createAbsoluteUrl(`/q/${galleryId}?token=${rawToken}&role=${role}`);

        tokenLogger.info('generateRoleToken', 'Generated token credentials', { 
          galleryId, 
          questionnaireId, 
          role,
          tokenId,
          expiresAt: new Date(expiresAt).toISOString()
        });

        // STEP 4: Execute Firestore-compliant atomic transaction
        // ALL READS BEFORE WRITES - NO QUERIES IN TRANSACTION
        const result = await runTransaction(db, async (transaction) => {
          // READ PHASE - get questionnaire document (ALL READS FIRST)
          const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
          const questionnaireSnap = await transaction.get(questionnaireRef);
          
          if (!questionnaireSnap.exists()) {
            throw new Error(`Questionnaire not found: ${questionnaireId} for gallery ${galleryId}`);
          }
          
          const questionnaireData = questionnaireSnap.data() as Questionnaire;
          const currentActiveTokenId = questionnaireData.activeTokens?.[role];
          
          tokenLogger.info('generateRoleToken', 'Current active token found', { 
            galleryId, 
            questionnaireId, 
            role,
            currentActiveTokenId: currentActiveTokenId || 'none'
          });

          // WRITE PHASE - all writes happen here atomically
          const tokenRef = doc(db, 'questionnaireTokens', tokenId);
          
          // 1. Create new token document
          const tokenDoc: QuestionnaireToken = {
            id: tokenId,
            tokenHash,
            galleryId,
            questionnaireId,
            role,
            expiresAt,
            createdAt: now
          };
          transaction.set(tokenRef, tokenDoc);
          
          // 2. Revoke current active token if exists (using activeTokenId, not query)
          if (currentActiveTokenId && currentActiveTokenId.trim()) {
            const currentTokenRef = doc(db, 'questionnaireTokens', currentActiveTokenId);
            transaction.update(currentTokenRef, {
              revoked: true,
              revokedAt: now
            });
            
            tokenLogger.info('generateRoleToken', 'Revoking current active token', { 
              galleryId, 
              questionnaireId, 
              role,
              revokedTokenId: currentActiveTokenId
            });
          }
          
          // 3. Update questionnaire with new token and activeTokenId
          transaction.update(questionnaireRef, {
            [`tokens.${role}`]: {
              tokenId,
              url,
              createdAt: now,
              expiresAt
            },
            [`activeTokens.${role}`]: tokenId, // Track new active token
            updatedAt: now
          });
          
          return { tokenId, url, createdAt: now, expiresAt };
        });

        // STEP 5: Cleanup orphaned tokens outside transaction (non-blocking)
        this.cleanupOrphanedTokens(galleryId, questionnaireId, role, tokenId).catch(error => {
          tokenLogger.warn('generateRoleToken', 'Orphaned token cleanup failed (non-critical)', { 
            galleryId, 
            questionnaireId, 
            role,
            error: error.message
          });
        });

        tokenLogger.info('generateRoleToken', 'Token generation completed successfully', { 
          galleryId, 
          questionnaireId, 
          role,
          tokenId,
          url: url.split('token=')[0] + 'token=***', // Log URL without exposing token
          createdAt: now,
          expiresAt
        });

        return result;
      });
    });
  }

  /**
   * Cleanup orphaned tokens outside main transaction (non-blocking)
   * Removes old tokens that are not tracked as active anymore
   */
  static async cleanupOrphanedTokens(
    galleryId: string,
    questionnaireId: string,
    role: Role,
    excludeTokenId: string
  ): Promise<void> {
    try {
      tokenLogger.info('cleanupOrphanedTokens', 'Starting orphaned token cleanup', { 
        galleryId, 
        questionnaireId, 
        role,
        excludeTokenId
      });

      // Find old tokens for this role (exclude the newly created one)
      const tokensQuery = query(
        collection(db, 'questionnaireTokens'),
        where('galleryId', '==', galleryId),
        where('questionnaireId', '==', questionnaireId),
        where('role', '==', role),
        where('revoked', '!=', true)
      );

      const snapshot = await getDocs(tokensQuery);
      const orphanedTokens = snapshot.docs.filter(doc => doc.id !== excludeTokenId);

      if (orphanedTokens.length === 0) {
        tokenLogger.info('cleanupOrphanedTokens', 'No orphaned tokens found', { 
          galleryId, 
          questionnaireId, 
          role
        });
        return;
      }

      // Revoke orphaned tokens
      const now = Date.now();
      const revokePromises = orphanedTokens.map(doc =>
        updateDoc(doc.ref, {
          revoked: true,
          revokedAt: now
        })
      );

      await Promise.all(revokePromises);

      // Cleanup validation sessions for revoked tokens
      const { TokenValidationService } = await import('./tokenValidation');
      for (const doc of orphanedTokens) {
        await TokenValidationService.cleanupSessionsByTokenId(doc.id);
      }

      tokenLogger.info('cleanupOrphanedTokens', 'Successfully cleaned up orphaned tokens', { 
        galleryId, 
        questionnaireId, 
        role,
        cleanedCount: orphanedTokens.length,
        cleanedTokenIds: orphanedTokens.map(doc => doc.id)
      });
    } catch (error) {
      tokenLogger.error('cleanupOrphanedTokens', 'Failed to cleanup orphaned tokens', error, { 
        galleryId, 
        questionnaireId, 
        role,
        excludeTokenId
      });
      // Don't throw - this is non-critical cleanup
    }
  }

  /**
   * Revoca token con cleanup completo - FIXED per Bug #5
   * Rimuove completamente le proprietà invece di impostare valori vuoti
   * Offre opzione per eliminazione fisica dei documenti token
   */
  static async revokeToken(
    galleryId: string, 
    questionnaireId: string, 
    role: Role,
    options: {
      physicalDeletion?: boolean; // Eliminazione fisica del token doc
      cleanupSessions?: boolean;  // Cleanup sessioni di validazione
      cleanupAnswers?: boolean;   // Cleanup bozze risposte
    } = {}
  ): Promise<void> {
    const {
      physicalDeletion = false,
      cleanupSessions = true,
      cleanupAnswers = false
    } = options;

    return await measurePerformance(tokenLogger, 'revokeToken', async () => {
      // Input validation
      if (!galleryId?.trim() || !questionnaireId?.trim() || !role?.trim()) {
        const error = new Error('Invalid input parameters: galleryId, questionnaireId, and role are required');
        tokenLogger.error('revokeToken', 'Token revocation failed - invalid input', error, { 
          galleryId, 
          questionnaireId, 
          role
        });
        throw error;
      }

      const lockResourceId = `${galleryId}_${role}`;
      const operation = 'revokeToken';
      
      tokenLogger.info('revokeToken', 'Starting comprehensive token revocation', { 
        galleryId, 
        questionnaireId, 
        role,
        physicalDeletion,
        cleanupSessions,
        cleanupAnswers,
        lockResourceId 
      });

      return await withDistributedLock(lockResourceId, operation, async () => {
        const now = Date.now();
        let revokedTokenId: string | null = null;
        
        // STEP 1: Atomic transaction for token revocation and questionnaire cleanup
        await runTransaction(db, async (transaction) => {
          // READ PHASE: Get questionnaire to find active token (ALL READS FIRST)
          const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
          const questionnaireSnap = await transaction.get(questionnaireRef);
          
          if (!questionnaireSnap.exists()) {
            throw new Error(`Questionnaire not found: ${questionnaireId} for gallery ${galleryId}`);
          }
          
          const questionnaireData = questionnaireSnap.data() as Questionnaire;
          const activeTokenId = questionnaireData.activeTokens?.[role];
          revokedTokenId = activeTokenId || null;
          
          tokenLogger.info('revokeToken', 'Found active token for revocation', { 
            galleryId, 
            questionnaireId, 
            role,
            activeTokenId: activeTokenId || 'none',
            physicalDeletion
          });

          // WRITE PHASE: Handle token and questionnaire updates atomically
          if (activeTokenId && activeTokenId.trim()) {
            const tokenRef = doc(db, 'questionnaireTokens', activeTokenId);
            
            if (physicalDeletion) {
              // Option 1: Physical deletion of token document
              transaction.delete(tokenRef);
              
              tokenLogger.info('revokeToken', 'Physically deleted token document', { 
                galleryId, 
                questionnaireId, 
                role,
                deletedTokenId: activeTokenId
              });
            } else {
              // Option 2: Mark as revoked (default)
              transaction.update(tokenRef, {
                revoked: true,
                revokedAt: now
              });
              
              tokenLogger.info('revokeToken', 'Marked token as revoked', { 
                galleryId, 
                questionnaireId, 
                role,
                revokedTokenId: activeTokenId
              });
            }
          }
          
          // CRITICAL FIX: Use deleteField() to completely remove properties
          // Instead of setting empty values, remove properties entirely from document
          const questionnaireUpdates: any = {
            [`tokens.${role}`]: deleteField(),      // Remove entire token property
            [`activeTokens.${role}`]: deleteField(), // Remove activeToken reference
            updatedAt: now
          };

          transaction.update(questionnaireRef, questionnaireUpdates);
          
          tokenLogger.info('revokeToken', 'Completely removed token properties from questionnaire', { 
            galleryId, 
            questionnaireId, 
            role,
            removedProperties: [`tokens.${role}`, `activeTokens.${role}`]
          });
        });

        // STEP 2: Post-transaction cleanup operations (non-blocking)
        const cleanupPromises: Promise<void>[] = [];

        // Cleanup validation sessions
        if (cleanupSessions && revokedTokenId) {
          const sessionCleanup = this.cleanupValidationSessions(revokedTokenId, galleryId, questionnaireId, role);
          cleanupPromises.push(sessionCleanup);
        }

        // Cleanup answer drafts if requested
        if (cleanupAnswers) {
          const draftCleanup = this.cleanupAnswerDrafts(galleryId, questionnaireId, role);
          cleanupPromises.push(draftCleanup);
        }

        // Additional cleanup: Remove orphaned tokens for this role/gallery
        const orphanCleanup = this.cleanupOrphanedTokensForRevocation(galleryId, questionnaireId, role);
        cleanupPromises.push(orphanCleanup);

        // Execute all cleanup operations in parallel (non-blocking)
        if (cleanupPromises.length > 0) {
          Promise.all(cleanupPromises).catch(error => {
            tokenLogger.warn('revokeToken', 'Some cleanup operations failed (non-critical)', { 
              galleryId, 
              questionnaireId, 
              role,
              error: error.message
            });
          });
        }

        tokenLogger.info('revokeToken', 'Token revocation completed successfully', { 
          galleryId, 
          questionnaireId, 
          role,
          revokedTokenId,
          physicalDeletion,
          cleanupOperations: cleanupPromises.length
        });
      });
    });
  }

  /**
   * Cleanup validation sessions for revoked token
   */
  static async cleanupValidationSessions(
    tokenId: string,
    galleryId: string,
    questionnaireId: string,
    role: Role
  ): Promise<void> {
    try {
      tokenLogger.info('cleanupValidationSessions', 'Starting validation session cleanup', { 
        galleryId, 
        questionnaireId, 
        role,
        tokenId
      });

      const { TokenValidationService } = await import('./tokenValidation');
      await TokenValidationService.cleanupSessionsByTokenId(tokenId);
      
      tokenLogger.info('cleanupValidationSessions', 'Successfully cleaned up validation sessions', { 
        galleryId, 
        questionnaireId, 
        role,
        tokenId
      });
    } catch (error) {
      tokenLogger.error('cleanupValidationSessions', 'Failed to cleanup validation sessions', error, { 
        galleryId, 
        questionnaireId, 
        role,
        tokenId
      });
      // Don't throw - this is non-critical cleanup
    }
  }

  /**
   * Cleanup answer drafts for revoked role
   */
  static async cleanupAnswerDrafts(
    galleryId: string,
    questionnaireId: string,
    role: Role
  ): Promise<void> {
    try {
      tokenLogger.info('cleanupAnswerDrafts', 'Starting answer drafts cleanup', { 
        galleryId, 
        questionnaireId, 
        role
      });

      const draftRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId, 'drafts', role);
      await deleteDoc(draftRef);
      
      tokenLogger.info('cleanupAnswerDrafts', 'Successfully cleaned up answer drafts', { 
        galleryId, 
        questionnaireId, 
        role
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'not-found') {
        tokenLogger.info('cleanupAnswerDrafts', 'No draft document to cleanup (expected)', { 
          galleryId, 
          questionnaireId, 
          role
        });
      } else {
        tokenLogger.error('cleanupAnswerDrafts', 'Failed to cleanup answer drafts', error, { 
          galleryId, 
          questionnaireId, 
          role
        });
      }
      // Don't throw - this is non-critical cleanup
    }
  }

  /**
   * Cleanup orphaned tokens for specific role after revocation
   */
  static async cleanupOrphanedTokensForRevocation(
    galleryId: string,
    questionnaireId: string,
    role: Role
  ): Promise<void> {
    try {
      tokenLogger.info('cleanupOrphanedTokensForRevocation', 'Starting orphaned tokens cleanup', { 
        galleryId, 
        questionnaireId, 
        role
      });

      // Find all non-revoked tokens for this role/gallery/questionnaire
      const tokensQuery = query(
        collection(db, 'questionnaireTokens'),
        where('galleryId', '==', galleryId),
        where('questionnaireId', '==', questionnaireId),
        where('role', '==', role),
        where('revoked', '!=', true)
      );

      const snapshot = await getDocs(tokensQuery);
      
      if (snapshot.docs.length === 0) {
        tokenLogger.info('cleanupOrphanedTokensForRevocation', 'No orphaned tokens found', { 
          galleryId, 
          questionnaireId, 
          role
        });
        return;
      }

      // Mark all remaining tokens as orphaned/revoked
      const now = Date.now();
      const revokePromises = snapshot.docs.map(doc =>
        updateDoc(doc.ref, {
          revoked: true,
          revokedAt: now,
          orphaned: true,
          orphanedReason: 'Cleanup after token revocation'
        })
      );

      await Promise.all(revokePromises);

      tokenLogger.info('cleanupOrphanedTokensForRevocation', 'Successfully cleaned up orphaned tokens', { 
        galleryId, 
        questionnaireId, 
        role,
        cleanedCount: snapshot.docs.length,
        cleanedTokenIds: snapshot.docs.map(doc => doc.id)
      });
    } catch (error) {
      tokenLogger.error('cleanupOrphanedTokensForRevocation', 'Failed to cleanup orphaned tokens', error, { 
        galleryId, 
        questionnaireId, 
        role
      });
      // Don't throw - this is non-critical cleanup
    }
  }


  /**
   * Verifica completamento questionario per entrambi i ruoli
   */
  static async checkQuestionnaireCompletion(galleryId: string, questionnaireId: string): Promise<{
    bride: { completed: boolean; progress: number };
    groom: { completed: boolean; progress: number };
    overallCompleted: boolean;
  }> {
    try {
      const answers = await this.getAllAnswers(galleryId, questionnaireId);

      const brideCompleted = answers.bride?.status === 'submitted';
      const groomCompleted = answers.groom?.status === 'submitted';

      // Ottieni numero reale di domande dal FAQ set
      const questionnaire = await this.getGalleryQuestionnaire(galleryId);
      const faqSet = questionnaire ? await this.getFaqSetById(questionnaire.faqSetId) : null;
      const totalQuestions = faqSet?.questions.length || 10;

      const brideProgress = answers.bride ?
        (Object.keys(answers.bride.answers).length / totalQuestions) * 100 : 0;
      const groomProgress = answers.groom ?
        (Object.keys(answers.groom.answers).length / totalQuestions) * 100 : 0;

      return {
        bride: { completed: brideCompleted, progress: brideProgress },
        groom: { completed: groomCompleted, progress: groomProgress },
        overallCompleted: brideCompleted && groomCompleted
      };
    } catch (error) {
      console.error('Errore verifica completamento:', error);
      return {
        bride: { completed: false, progress: 0 },
        groom: { completed: false, progress: 0 },
        overallCompleted: false
      };
    }
  }

  /**
   * Valida token per accesso questionario
   */
  static async validateToken(rawToken: string, galleryId: string, role: Role): Promise<{
    valid: boolean;
    questionnaireId?: string;
    tokenId?: string;
  }> {
    try {
      const tokenHash = await sha256Hash(rawToken);

      // Cerca token in collection tokens
      const tokensQuery = query(
        collection(db, 'questionnaireTokens'),
        where('tokenHash', '==', tokenHash),
        where('galleryId', '==', galleryId),
        where('role', '==', role),
        limit(1)
      );

      const snapshot = await getDocs(tokensQuery);

      if (snapshot.empty) {
        return { valid: false };
      }

      const tokenDoc = snapshot.docs[0].data() as QuestionnaireToken;

      // Verifica scadenza e revoca
      const now = Date.now();
      if (tokenDoc.expiresAt < now || tokenDoc.revoked) {
        return { valid: false };
      }

      // Aggiorna usedAt se è il primo utilizzo
      if (!tokenDoc.usedAt) {
        await updateDoc(snapshot.docs[0].ref, { usedAt: now });
      }

      return {
        valid: true,
        questionnaireId: tokenDoc.questionnaireId,
        tokenId: tokenDoc.id
      };
    } catch (error) {
      console.error('Errore validazione token:', error);
      return { valid: false };
    }
  }


  // ====== ANSWERS MANAGEMENT ======

  /**
   * Salva bozza risposta
   */
  static async saveDraft(
    galleryId: string,
    questionnaireId: string,
    role: Role,
    questionKey: QuestionKey,
    answer: string
  ): Promise<void> {
    try {
      const draftRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId, 'drafts', role);

      // Carica draft esistente per versioning ottimistico
      const draftDoc = await getDoc(draftRef);
      const currentVersion = draftDoc.exists() ? (draftDoc.data()?.version || 0) : 0;

      const draftData: Partial<AnswerDraft> = {
        [`answers.${questionKey}`]: answer.trim(),
        version: currentVersion + 1,
        updatedAt: Date.now()
      };

      if (!draftDoc.exists()) {
        // Crea nuovo draft
        const newDraft: AnswerDraft = {
          id: role,
          galleryId,
          questionnaireId,
          role,
          answers: { [questionKey]: answer.trim() },
          version: 1,
          updatedAt: Date.now()
        };
        await setDoc(draftRef, newDraft);
      } else {
        // Aggiorna draft esistente
        await updateDoc(draftRef, draftData);
      }
    } catch (error) {
      console.error('Errore salvataggio bozza:', error);
      throw new Error('Errore durante il salvataggio della bozza');
    }
  }

  /**
   * Ottieni bozza risposte
   */
  static async getDraft(galleryId: string, questionnaireId: string, role: Role): Promise<AnswerDraft | null> {
    try {
      const draftRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId, 'drafts', role);
      const draftDoc = await getDoc(draftRef);

      if (draftDoc.exists()) {
        const data = draftDoc.data();
        return data as AnswerDraft;
      } else {
        return null;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        console.warn(`⚠️ Permessi insufficienti per recuperare bozza ${role}, ritorno null`);
        return null;
      }
      console.error('Errore recupero bozza:', error);
      throw error;
    }
  }

  /**
   * Sottometti risposte finali
   */
  static async submitAnswers(
    galleryId: string,
    questionnaireId: string,
    role: Role,
    answers: Record<QuestionKey, string>
  ): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        const answersRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId, 'answers', role);
        const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
        const draftRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId, 'drafts', role);

        const now = Date.now();

        // Salva risposte finali
        const finalAnswers: AnswerSet = {
          id: role,
          galleryId,
          questionnaireId,
          role,
          answers,
          status: 'submitted',
          completedAt: now,
          version: 1
        };

        transaction.set(answersRef, finalAnswers);

        // Aggiorna status nel questionario (usa set per creare se non esiste)
        transaction.set(questionnaireRef, {
          [`status.${role}.completedAt`]: now,
          [`status.${role}.progress`]: 100,
          updatedAt: now
        }, { merge: true });

        // Marca draft come completato (usa set per creare se non esiste)
        transaction.set(draftRef, {
          id: role,
          galleryId,
          questionnaireId,
          role,
          answers,
          completed: true,
          updatedAt: now,
          version: 1
        });
      });
    } catch (error) {
      console.error('Errore sottomissione risposte:', error);
      throw new Error('Errore durante l\'invio delle risposte');
    }
  }

  /**
   * Ottieni risposte finali
   */
  static async getAnswers(galleryId: string, questionnaireId: string, role: Role): Promise<AnswerSet | null> {
    try {
      const answersRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId, 'answers', role);
      const answersDoc = await getDoc(answersRef);

      if (answersDoc.exists()) {
        const data = answersDoc.data();
        return data as AnswerSet;
      } else {
        return null;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Missing or insufficient permissions')) {
        console.warn(`⚠️ Permessi insufficienti per recuperare risposte ${role}, ritorno null`);
        return null;
      }
      console.error('Errore recupero risposte:', error);
      throw error;
    }
  }

  /**
   * Ottieni tutte le risposte di un questionario (bride + groom)
   */
  static async getAllAnswers(galleryId: string, questionnaireId: string): Promise<{
    bride: AnswerSet | null;
    groom: AnswerSet | null;
  }> {
    try {
      const [brideAnswers, groomAnswers] = await Promise.all([
        this.getAnswers(galleryId, questionnaireId, 'bride'),
        this.getAnswers(galleryId, questionnaireId, 'groom')
      ]);

      return { bride: brideAnswers, groom: groomAnswers };
    } catch (error) {
      console.error('Errore recupero tutte le risposte:', error);
      return { bride: null, groom: null };
    }
  }
}
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
  runTransaction
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
   */
  static async activateFaqSet(id: string): Promise<void> {
    try {
      await runTransaction(db, async (transaction) => {
        // Disattiva tutti i set
        const allSetsQuery = query(collection(db, 'faqSets'));
        const allSetsSnapshot = await getDocs(allSetsQuery);

        allSetsSnapshot.docs.forEach(doc => {
          transaction.update(doc.ref, { active: false, updatedAt: Date.now() });
        });

        // Attiva il set selezionato
        const targetSetRef = doc(db, 'faqSets', id);
        transaction.update(targetSetRef, { active: true, updatedAt: Date.now() });
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
   * Genera token sicuro per role specifico
   */
  static async generateRoleToken(
    galleryId: string,
    questionnaireId: string,
    role: Role
  ): Promise<{ tokenId: string; url: string }> {
    try {
      // STEP 1: Revoca token esistenti per questo role
      await this.revokeToken(galleryId, questionnaireId, role);

      // STEP 2: Genera nuovo token sicuro
      const rawToken = generateSecureToken();
      const tokenHash = await sha256Hash(rawToken);
      const tokenId = generateSecureToken(); // ID separato dal token

      const now = Date.now();
      const expiresAt = now + (90 * 24 * 60 * 60 * 1000); // 90 giorni

      // STEP 3: Salva token in collection separata
      const tokenRef = doc(db, 'questionnaireTokens', tokenId);
      const tokenDoc: QuestionnaireToken = {
        id: tokenId,
        tokenHash,
        galleryId,
        questionnaireId,
        role,
        expiresAt,
        createdAt: now
      };

      await setDoc(tokenRef, tokenDoc);

      // STEP 4: Genera URL pubblico con base path corretto
      const { createAbsoluteUrl } = await import('./basePath');
      const url = createAbsoluteUrl(`/q/${galleryId}?token=${rawToken}&role=${role}`);

      // STEP 5: Aggiorna questionnaire con nuovo token
      const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
      await updateDoc(questionnaireRef, {
        [`tokens.${role}`]: {
          tokenId,
          url,
          createdAt: now,
          expiresAt
        },
        updatedAt: now
      });

      return { tokenId, url };
    } catch (error) {
      console.error('Errore generazione token:', error);
      throw new Error('Errore durante la generazione del token');
    }
  }

  /**
   * Revoca token specifico
   */
  static async revokeToken(galleryId: string, questionnaireId: string, role: Role): Promise<void> {
    try {
      // Trova e revoca token
      const tokensQuery = query(
        collection(db, 'questionnaireTokens'),
        where('galleryId', '==', galleryId),
        where('questionnaireId', '==', questionnaireId),
        where('role', '==', role),
        where('revoked', '!=', true) // Solo token non ancora revocati
      );

      const snapshot = await getDocs(tokensQuery);
      const updatePromises = snapshot.docs.map(doc =>
        updateDoc(doc.ref, {
          revoked: true,
          revokedAt: Date.now()
        })
      );

      await Promise.all(updatePromises);

      // Cleanup sessioni di validazione per i token revocati
      const { TokenValidationService } = await import('./tokenValidation');
      for (const doc of snapshot.docs) {
        await TokenValidationService.cleanupSessionsByTokenId(doc.id);
      }

      // Aggiorna questionnaire
      const questionnaireRef = doc(db, 'galleries', galleryId, 'questionnaires', questionnaireId);
      await updateDoc(questionnaireRef, {
        [`tokens.${role}`]: {
          tokenId: '',
          url: '',
          createdAt: Date.now(),
          expiresAt: Date.now(),
          revoked: true
        },
        updatedAt: Date.now()
      });
    } catch (error) {
      console.error('Errore revoca token:', error);
      throw new Error('Errore durante la revoca del token');
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

        // Aggiorna status nel questionario
        transaction.update(questionnaireRef, {
          [`status.${role}.completedAt`]: now,
          [`status.${role}.progress`]: 100,
          updatedAt: now
        });

        // Marca draft come completato
        transaction.update(draftRef, {
          completed: true,
          updatedAt: now
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
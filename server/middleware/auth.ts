import { Request, Response, NextFunction } from 'express';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SecurityQuestionType } from '../../shared/schema';

export interface AuthenticatedRequest extends Request {
  user?: {
    email: string;
    name: string;
    isAdmin?: boolean;
  };
  gallery?: {
    id: string;
    password: string;
    code: string;
    active: boolean;
    requiresSecurityQuestion?: boolean;
    securityQuestionType?: SecurityQuestionType;
    securityQuestionCustom?: string;
    securityAnswer?: string;
  };
}

// Helper function to get security question text
export const getSecurityQuestionText = (type: SecurityQuestionType, customQuestion?: string): string => {
  switch (type) {
    case SecurityQuestionType.LOCATION:
      return "Qual è il nome della location dell'evento?";
    case SecurityQuestionType.MONTH:
      return "In che mese si è svolto l'evento?";
    case SecurityQuestionType.CUSTOM:
      return customQuestion || "Domanda personalizzata non disponibile";
    default:
      return "Domanda di sicurezza non valida";
  }
};

// Middleware per autenticazione utente su operazioni sensibili
export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  // Estrai credenziali dal body (inviate automaticamente dal frontend)
  const { userEmail, userName } = req.body;

  // Controllo presenza credenziali
  if (!userEmail || !userName) {
    return res.status(401).json({ 
      error: 'Autenticazione richiesta',
      message: 'Email e nome utente sono obbligatori per questa operazione' 
    });
  }

  // Validazione formato email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userEmail)) {
    return res.status(400).json({ 
      error: 'Formato email non valido' 
    });
  }

  // Validazione lunghezza nome
  if (userName.length < 2 || userName.length > 50) {
    return res.status(400).json({ 
      error: 'Il nome deve essere tra 2 e 50 caratteri' 
    });
  }

  // Sanitizzazione input
  req.user = {
    email: userEmail.trim().toLowerCase(),
    name: userName.trim()
  };

  next();
};

// Middleware per verificare che la galleria esista ed è attiva
export const validateGallery = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { galleryId } = req.params;

    if (!galleryId) {
      return res.status(400).json({ error: 'ID galleria richiesto' });
    }

    // Recupera dati galleria
    const galleryRef = doc(db, 'galleries', galleryId);
    const galleryDoc = await getDoc(galleryRef);

    if (!galleryDoc.exists()) {
      return res.status(404).json({ error: 'Galleria non trovata' });
    }

    const galleryData = galleryDoc.data();

    // Verifica che la galleria sia attiva
    if (!galleryData.active) {
      return res.status(403).json({ error: 'Galleria non disponibile' });
    }

    req.gallery = {
      id: galleryId,
      password: galleryData.password,
      code: galleryData.code,
      active: galleryData.active,
      requiresSecurityQuestion: galleryData.requiresSecurityQuestion,
      securityQuestionType: galleryData.securityQuestionType,
      securityQuestionCustom: galleryData.securityQuestionCustom,
      securityAnswer: galleryData.securityAnswer
    };

    next();
  } catch (error) {
    console.error('Errore validazione galleria:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Middleware per verificare accesso completo con domanda di sicurezza
export const requireGalleryAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.gallery) {
      return res.status(400).json({ error: 'Validazione galleria richiesta prima di questo middleware' });
    }

    const { password, securityAnswer } = req.body;

    // Verifica password galleria
    if (req.gallery.password && req.gallery.password !== password) {
      return res.status(403).json({ 
        error: 'Password galleria non corretta',
        requiresPassword: true 
      });
    }

    // Verifica domanda di sicurezza se abilitata
    if (req.gallery.requiresSecurityQuestion && req.gallery.securityQuestionType && req.gallery.securityAnswer) {
      if (!securityAnswer) {
        const questionText = getSecurityQuestionText(req.gallery.securityQuestionType, req.gallery.securityQuestionCustom);
        return res.status(403).json({
          error: 'Risposta alla domanda di sicurezza richiesta',
          requiresSecurityQuestion: true,
          securityQuestion: questionText
        });
      }

      // Confronto case-insensitive e trimmed
      const normalizedUserAnswer = securityAnswer.trim().toLowerCase();
      const normalizedCorrectAnswer = req.gallery.securityAnswer.trim().toLowerCase();

      if (normalizedUserAnswer !== normalizedCorrectAnswer) {
        const questionText = getSecurityQuestionText(req.gallery.securityQuestionType, req.gallery.securityQuestionCustom);
        return res.status(403).json({
          error: 'Risposta alla domanda di sicurezza non corretta',
          requiresSecurityQuestion: true,
          securityQuestion: questionText
        });
      }
    }

    next();
  } catch (error) {
    console.error('Errore verifica accesso galleria:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Middleware per verificare permessi admin
export const requireAdmin = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Autenticazione richiesta' });
    }

    // Lista admin (in produzione dovrebbe essere in database)
    const adminEmails = [
      'gennaro.mazzacane@gmail.com',
      'admin@studio.com'
    ];

    const isAdmin = adminEmails.includes(req.user.email);
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Permessi amministratore richiesti' });
    }

    req.user.isAdmin = true;
    next();
  } catch (error) {
    console.error('Errore verifica admin:', error);
    res.status(500).json({ error: 'Errore interno del server' });
  }
};

// Middleware per rate limiting più permissivo per operazioni normali
let requestCounts = new Map<string, { count: number; resetTime: number }>();

// Reset cache ogni ora per evitare accumulo memoria
setInterval(() => {
  requestCounts.clear();
}, 60 * 60 * 1000);
const RATE_LIMIT_WINDOW = 5 * 60 * 1000; // 5 minuti
const MAX_REQUESTS = 50; // 50 richieste per finestra per operazioni sensibili

export const rateLimit = (req: Request, res: Response, next: NextFunction) => {
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  
  const clientData = requestCounts.get(clientId);
  
  if (!clientData) {
    requestCounts.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return next();
  }
  
  if (now > clientData.resetTime) {
    clientData.count = 1;
    clientData.resetTime = now + RATE_LIMIT_WINDOW;
    return next();
  }
  
  if (clientData.count >= MAX_REQUESTS) {
    return res.status(429).json({ 
      error: 'Limite temporaneo raggiunto',
      message: 'Troppe operazioni consecutive. Riprova tra qualche minuto.' 
    });
  }
  
  clientData.count++;
  next();
};

// Middleware per sanitizzazione input
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Sanitizza tutti i campi stringa nel body
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        // Rimuove HTML tags e caratteri pericolosi
        req.body[key] = req.body[key]
          .replace(/<[^>]*>/g, '') // Rimuove HTML tags
          .replace(/[<>\"']/g, '') // Rimuove caratteri pericolosi
          .trim();
      }
    });
  }
  
  next();
};

// Middleware per validazione parametri URL
export const validateParams = (req: Request, res: Response, next: NextFunction) => {
  const { galleryId, itemId, commentId } = req.params;
  
  // Valida formato ID Firebase (solo caratteri alfanumerici e alcuni caratteri speciali)
  const idRegex = /^[a-zA-Z0-9_-]+$/;
  
  if (galleryId && !idRegex.test(galleryId)) {
    return res.status(400).json({ error: 'Formato ID galleria non valido' });
  }
  
  if (itemId && !idRegex.test(itemId)) {
    return res.status(400).json({ error: 'Formato ID elemento non valido' });
  }
  
  if (commentId && !idRegex.test(commentId)) {
    return res.status(400).json({ error: 'Formato ID commento non valido' });
  }
  
  next();
};
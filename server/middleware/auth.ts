import { Request, Response, NextFunction } from 'express';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
  };
}

// Middleware per autenticazione utente
export const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const { userEmail, userName } = req.body;
  const authHeader = req.headers.authorization;

  // Controllo presenza credenziali
  if (!userEmail || !userName) {
    return res.status(401).json({ 
      error: 'Autenticazione richiesta',
      message: 'Email e nome utente sono obbligatori' 
    });
  }

  // Validazione formato email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(userEmail)) {
    return res.status(400).json({ 
      error: 'Formato email non valido' 
    });
  }

  // Sanitizzazione input
  req.user = {
    email: userEmail.trim().toLowerCase(),
    name: userName.trim()
  };

  next();
};

// Middleware per verificare accesso alla galleria
export const requireGalleryAccess = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { galleryId } = req.params;
    const { password } = req.body || {};

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

    // Verifica password se richiesta
    if (galleryData.password && galleryData.password !== password) {
      return res.status(403).json({ 
        error: 'Password galleria richiesta',
        requiresPassword: true 
      });
    }

    req.gallery = {
      id: galleryId,
      password: galleryData.password,
      code: galleryData.code,
      active: galleryData.active
    };

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

// Middleware per rate limiting semplice
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minuti
const MAX_REQUESTS = 100; // Massimo 100 richieste per finestra

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
      error: 'Troppi tentativi',
      message: 'Limite di richieste superato. Riprova tra 15 minuti.' 
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
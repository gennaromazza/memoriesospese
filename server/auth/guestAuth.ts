import { Request, Response, NextFunction } from 'express';
import { GalleryGuest, GalleryGuestSession } from '@shared/schema';
import { db } from '../firebase';
import { collection, doc, getDoc, addDoc, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import jwt from 'jsonwebtoken';

const GUEST_SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 giorni
const JWT_SECRET_GUEST = process.env.JWT_SECRET_GUEST || 'fallback-guest-secret';

// Middleware per verificare se l'ospite è autenticato per una galleria
export async function requireGalleryGuest(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.guestToken;
    const galleryId = req.params.galleryId || req.body.galleryId;
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token di autenticazione ospite richiesto',
        requiresAuth: true
      });
    }

    if (!galleryId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID galleria richiesto' 
      });
    }

    // Verifica JWT
    const decoded = jwt.verify(token, JWT_SECRET_GUEST) as { 
      guestId: string, 
      sessionId: string, 
      galleryId: string 
    };
    
    // Verifica che il token sia per la galleria corretta
    if (decoded.galleryId !== galleryId) {
      return res.status(403).json({ 
        success: false, 
        message: 'Token non valido per questa galleria',
        requiresAuth: true
      });
    }

    // Verifica sessione nel database
    const sessionDoc = await getDoc(doc(db, 'gallery_guest_sessions', decoded.sessionId));
    if (!sessionDoc.exists()) {
      return res.status(401).json({ 
        success: false, 
        message: 'Sessione ospite non valida',
        requiresAuth: true
      });
    }

    const session = sessionDoc.data() as GalleryGuestSession;
    
    // Verifica se la sessione è scaduta
    if (session.expiresAt.toDate() < new Date()) {
      await updateDoc(doc(db, 'gallery_guest_sessions', decoded.sessionId), {
        isActive: false
      });
      
      return res.status(401).json({ 
        success: false, 
        message: 'Sessione ospite scaduta',
        requiresAuth: true
      });
    }

    // Ottieni dati ospite
    const guestDoc = await getDoc(doc(db, 'gallery_guests', decoded.guestId));
    if (!guestDoc.exists()) {
      return res.status(401).json({ 
        success: false, 
        message: 'Ospite non trovato',
        requiresAuth: true
      });
    }

    const guest = guestDoc.data() as GalleryGuest;
    
    if (!guest.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account ospite disattivato',
        requiresAuth: true
      });
    }

    // Aggiorna ultima attività
    await updateDoc(doc(db, 'gallery_guests', decoded.guestId), {
      lastActiveAt: serverTimestamp()
    });

    // Aggiungi ospite ai dati della richiesta
    (req as any).galleryGuest = guest;
    (req as any).guestSession = session;
    
    next();
  } catch (error) {
    console.error('Errore verifica ospite galleria:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Errore verifica autenticazione ospite',
      requiresAuth: true
    });
  }
}

// Registrazione ospite per una galleria
export async function registerGalleryGuest(
  email: string, 
  firstName: string, 
  lastName: string, 
  galleryId: string,
  profileImageUrl?: string
): Promise<{
  success: boolean;
  guest?: GalleryGuest;
  sessionToken?: string;
  message?: string;
}> {
  try {
    // Verifica se l'ospite esiste già per questa galleria
    const existingGuestQuery = query(
      collection(db, 'gallery_guests'),
      where('email', '==', email),
      where('galleryId', '==', galleryId)
    );
    
    const existingGuestSnapshot = await getDocs(existingGuestQuery);
    
    if (!existingGuestSnapshot.empty) {
      // L'ospite esiste già, crea una nuova sessione
      const existingGuest = existingGuestSnapshot.docs[0];
      const guestData = existingGuest.data() as GalleryGuest;
      
      if (!guestData.isActive) {
        return {
          success: false,
          message: 'Account disattivato per questa galleria'
        };
      }

      // Crea nuova sessione
      const sessionData = {
        guestId: existingGuest.id,
        galleryId: galleryId,
        sessionToken: jwt.sign({ guestId: existingGuest.id, galleryId }, JWT_SECRET_GUEST + Date.now()),
        expiresAt: new Date(Date.now() + GUEST_SESSION_DURATION),
        createdAt: serverTimestamp(),
        isActive: true
      };

      const sessionRef = await addDoc(collection(db, 'gallery_guest_sessions'), sessionData);

      // Aggiorna ultima attività
      await updateDoc(doc(db, 'gallery_guests', existingGuest.id), {
        lastActiveAt: serverTimestamp()
      });

      // Crea JWT token
      const jwtToken = jwt.sign(
        { 
          guestId: existingGuest.id, 
          sessionId: sessionRef.id,
          galleryId: galleryId,
          email: guestData.email,
          firstName: guestData.firstName,
          lastName: guestData.lastName
        }, 
        JWT_SECRET_GUEST,
        { expiresIn: '7d' }
      );

      return {
        success: true,
        guest: { ...guestData, id: existingGuest.id },
        sessionToken: jwtToken
      };
    }

    // Crea nuovo ospite
    const guestData = {
      email,
      firstName,
      lastName,
      galleryId,
      profileImageUrl: profileImageUrl || null,
      registeredAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      isActive: true
    };

    const guestRef = await addDoc(collection(db, 'gallery_guests'), guestData);

    // Crea sessione
    const sessionData = {
      guestId: guestRef.id,
      galleryId: galleryId,
      sessionToken: jwt.sign({ guestId: guestRef.id, galleryId }, JWT_SECRET_GUEST + Date.now()),
      expiresAt: new Date(Date.now() + GUEST_SESSION_DURATION),
      createdAt: serverTimestamp(),
      isActive: true
    };

    const sessionRef = await addDoc(collection(db, 'gallery_guest_sessions'), sessionData);

    // Crea JWT token
    const jwtToken = jwt.sign(
      { 
        guestId: guestRef.id, 
        sessionId: sessionRef.id,
        galleryId: galleryId,
        email: email,
        firstName: firstName,
        lastName: lastName
      }, 
      JWT_SECRET_GUEST,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      guest: { ...guestData, id: guestRef.id } as GalleryGuest,
      sessionToken: jwtToken
    };

  } catch (error) {
    console.error('Errore registrazione ospite galleria:', error);
    return {
      success: false,
      message: 'Errore interno del server'
    };
  }
}

// Login ospite esistente per una galleria
export async function loginGalleryGuest(email: string, galleryId: string): Promise<{
  success: boolean;
  guest?: GalleryGuest;
  sessionToken?: string;
  message?: string;
}> {
  try {
    // Trova ospite per email e galleria
    const guestQuery = query(
      collection(db, 'gallery_guests'),
      where('email', '==', email),
      where('galleryId', '==', galleryId),
      where('isActive', '==', true)
    );
    
    const guestSnapshot = await getDocs(guestQuery);
    
    if (guestSnapshot.empty) {
      return {
        success: false,
        message: 'Ospite non registrato per questa galleria'
      };
    }

    const guestDoc = guestSnapshot.docs[0];
    const guest = guestDoc.data() as GalleryGuest;

    // Crea sessione
    const sessionData = {
      guestId: guestDoc.id,
      galleryId: galleryId,
      sessionToken: jwt.sign({ guestId: guestDoc.id, galleryId }, JWT_SECRET_GUEST + Date.now()),
      expiresAt: new Date(Date.now() + GUEST_SESSION_DURATION),
      createdAt: serverTimestamp(),
      isActive: true
    };

    const sessionRef = await addDoc(collection(db, 'gallery_guest_sessions'), sessionData);

    // Aggiorna ultima attività
    await updateDoc(doc(db, 'gallery_guests', guestDoc.id), {
      lastActiveAt: serverTimestamp()
    });

    // Crea JWT token
    const jwtToken = jwt.sign(
      { 
        guestId: guestDoc.id, 
        sessionId: sessionRef.id,
        galleryId: galleryId,
        email: guest.email,
        firstName: guest.firstName,
        lastName: guest.lastName
      }, 
      JWT_SECRET_GUEST,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      guest: { ...guest, id: guestDoc.id },
      sessionToken: jwtToken
    };

  } catch (error) {
    console.error('Errore login ospite galleria:', error);
    return {
      success: false,
      message: 'Errore interno del server'
    };
  }
}

// Logout ospite
export async function logoutGalleryGuest(sessionId: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'gallery_guest_sessions', sessionId), {
      isActive: false
    });
    return true;
  } catch (error) {
    console.error('Errore logout ospite galleria:', error);
    return false;
  }
}

// Verifica sessione ospite
export async function verifyGuestSession(token: string): Promise<{
  valid: boolean;
  guest?: GalleryGuest;
  galleryId?: string;
}> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET_GUEST) as { 
      guestId: string, 
      sessionId: string, 
      galleryId: string,
      email: string,
      firstName: string,
      lastName: string
    };
    
    const sessionDoc = await getDoc(doc(db, 'gallery_guest_sessions', decoded.sessionId));
    if (!sessionDoc.exists()) {
      return { valid: false };
    }

    const session = sessionDoc.data() as GalleryGuestSession;
    
    if (session.expiresAt.toDate() < new Date() || !session.isActive) {
      return { valid: false };
    }

    const guestDoc = await getDoc(doc(db, 'gallery_guests', decoded.guestId));
    if (!guestDoc.exists()) {
      return { valid: false };
    }

    const guest = guestDoc.data() as GalleryGuest;
    
    if (!guest.isActive) {
      return { valid: false };
    }

    return {
      valid: true,
      guest: { ...guest, id: decoded.guestId },
      galleryId: decoded.galleryId
    };

  } catch (error) {
    return { valid: false };
  }
}
import { Request, Response, NextFunction } from 'express';
import { AdminUser, AdminSession } from '@shared/schema';
import { db } from '../firebase';
import { collection, doc, getDoc, addDoc, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const ADMIN_SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 ore
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-admin-secret';

// Middleware per verificare se l'utente è admin
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.cookies?.adminToken;
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token di autenticazione admin richiesto' 
      });
    }

    // Verifica JWT
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string, sessionId: string };
    
    // Verifica sessione nel database
    const sessionDoc = await getDoc(doc(db, 'admin_sessions', decoded.sessionId));
    if (!sessionDoc.exists()) {
      return res.status(401).json({ 
        success: false, 
        message: 'Sessione admin non valida' 
      });
    }

    const session = sessionDoc.data() as AdminSession;
    
    // Verifica se la sessione è scaduta
    if (session.expiresAt.toDate() < new Date()) {
      // Rimuovi sessione scaduta
      await updateDoc(doc(db, 'admin_sessions', decoded.sessionId), {
        isActive: false
      });
      
      return res.status(401).json({ 
        success: false, 
        message: 'Sessione admin scaduta' 
      });
    }

    // Ottieni dati admin
    const adminDoc = await getDoc(doc(db, 'admin_users', decoded.adminId));
    if (!adminDoc.exists()) {
      return res.status(401).json({ 
        success: false, 
        message: 'Utente admin non trovato' 
      });
    }

    const admin = adminDoc.data() as AdminUser;
    
    if (!admin.isActive) {
      return res.status(401).json({ 
        success: false, 
        message: 'Account admin disattivato' 
      });
    }

    // Aggiungi admin ai dati della richiesta
    (req as any).admin = admin;
    (req as any).adminSession = session;
    
    next();
  } catch (error) {
    console.error('Errore verifica admin:', error);
    return res.status(401).json({ 
      success: false, 
      message: 'Errore verifica autenticazione admin' 
    });
  }
}

// Login admin
export async function loginAdmin(email: string, password: string): Promise<{
  success: boolean;
  admin?: AdminUser;
  sessionToken?: string;
  message?: string;
}> {
  try {
    // Trova admin per email
    const adminsQuery = query(
      collection(db, 'admin_users'),
      where('email', '==', email),
      where('isActive', '==', true)
    );
    
    const adminSnapshot = await getDocs(adminsQuery);
    
    if (adminSnapshot.empty) {
      return {
        success: false,
        message: 'Credenziali admin non valide'
      };
    }

    const adminDoc = adminSnapshot.docs[0];
    const admin = adminDoc.data() as AdminUser;

    // Verifica password
    const passwordMatch = await bcrypt.compare(password, admin.passwordHash);
    
    if (!passwordMatch) {
      return {
        success: false,
        message: 'Credenziali admin non valide'
      };
    }

    // Crea sessione
    const sessionData = {
      adminId: adminDoc.id,
      sessionToken: jwt.sign({ adminId: adminDoc.id }, JWT_SECRET + Date.now()),
      expiresAt: new Date(Date.now() + ADMIN_SESSION_DURATION),
      createdAt: serverTimestamp(),
      isActive: true
    };

    const sessionRef = await addDoc(collection(db, 'admin_sessions'), sessionData);

    // Aggiorna ultimo login
    await updateDoc(doc(db, 'admin_users', adminDoc.id), {
      lastLogin: serverTimestamp()
    });

    // Crea JWT token
    const jwtToken = jwt.sign(
      { 
        adminId: adminDoc.id, 
        sessionId: sessionRef.id,
        role: admin.role,
        permissions: admin.permissions
      }, 
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return {
      success: true,
      admin: { ...admin, id: adminDoc.id },
      sessionToken: jwtToken
    };

  } catch (error) {
    console.error('Errore login admin:', error);
    return {
      success: false,
      message: 'Errore interno del server'
    };
  }
}

// Logout admin
export async function logoutAdmin(sessionId: string): Promise<boolean> {
  try {
    await updateDoc(doc(db, 'admin_sessions', sessionId), {
      isActive: false
    });
    return true;
  } catch (error) {
    console.error('Errore logout admin:', error);
    return false;
  }
}

// Verifica sessione admin
export async function verifyAdminSession(token: string): Promise<{
  valid: boolean;
  admin?: AdminUser;
  permissions?: string[];
}> {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { adminId: string, sessionId: string, role: string, permissions: string[] };
    
    const sessionDoc = await getDoc(doc(db, 'admin_sessions', decoded.sessionId));
    if (!sessionDoc.exists()) {
      return { valid: false };
    }

    const session = sessionDoc.data() as AdminSession;
    
    if (session.expiresAt.toDate() < new Date() || !session.isActive) {
      return { valid: false };
    }

    const adminDoc = await getDoc(doc(db, 'admin_users', decoded.adminId));
    if (!adminDoc.exists()) {
      return { valid: false };
    }

    const admin = adminDoc.data() as AdminUser;
    
    if (!admin.isActive) {
      return { valid: false };
    }

    return {
      valid: true,
      admin: { ...admin, id: decoded.adminId },
      permissions: decoded.permissions
    };

  } catch (error) {
    return { valid: false };
  }
}
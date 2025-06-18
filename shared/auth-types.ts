// Tipi per i due sistemi di autenticazione separati

// Sistema di autenticazione ADMIN
export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'super_admin';
  permissions: string[];
  createdAt: Date;
  lastLogin?: Date;
}

export interface AdminLoginCredentials {
  email: string;
  password: string;
}

export interface AdminSession {
  adminId: string;
  sessionToken: string;
  expiresAt: Date;
  permissions: string[];
}

// Sistema di autenticazione OSPITI GALLERIA
export interface GalleryGuest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  galleryId: string;
  profileImageUrl?: string;
  registeredAt: Date;
  lastActiveAt?: Date;
}

export interface GalleryGuestRegistration {
  email: string;
  firstName: string;
  lastName: string;
  galleryId: string;
}

export interface GalleryGuestSession {
  guestId: string;
  galleryId: string;
  sessionToken: string;
  expiresAt: Date;
}

// Enums per distinguere i tipi di utente
export enum UserType {
  ADMIN = 'admin',
  GALLERY_GUEST = 'gallery_guest'
}

// Interfacce per le richieste API
export interface AuthResponse<T> {
  success: boolean;
  user?: T;
  sessionToken?: string;
  message?: string;
}

export interface VerifySessionRequest {
  sessionToken: string;
  userType: UserType;
}

export interface VerifySessionResponse {
  valid: boolean;
  user?: AdminUser | GalleryGuest;
  permissions?: string[];
}
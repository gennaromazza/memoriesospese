import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  User,
  UserCredential,
  setPersistence,
  browserLocalPersistence
} from "firebase/auth";
import { auth } from "../lib/firebase";

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserCredential>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    // Imposta la persistenza su LOCAL per mantenere l'utente connesso anche dopo la chiusura del browser
    await setPersistence(auth, browserLocalPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signOut = async () => {
    // Rimuove il flag isAdmin dal localStorage al logout
    localStorage.removeItem('isAdmin');
    return firebaseSignOut(auth);
  };

  const value = {
    currentUser,
    loading,
    signIn,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

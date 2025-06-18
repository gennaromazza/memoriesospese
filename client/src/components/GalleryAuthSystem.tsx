import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  User, 
  Mail, 
  Lock, 
  UserPlus, 
  LogIn,
  Heart,
  MessageCircle,
  Mic2,
  Bell,
  Loader2
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

interface GalleryAuthSystemProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  galleryName: string;
  onAuthSuccess: (user: FirebaseUser) => void;
}

export default function GalleryAuthSystem({
  isOpen,
  onClose,
  galleryId,
  galleryName,
  onAuthSuccess
}: GalleryAuthSystemProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register form state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [wantsNotifications, setWantsNotifications] = useState(true);

  const { toast } = useToast();

  // Check if user is already authenticated
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user && isOpen) {
        onAuthSuccess(user);
        onClose();
      }
    });

    return () => unsubscribe();
  }, [isOpen, onAuthSuccess, onClose]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      const user = userCredential.user;

      // Update user gallery association
      await associateUserWithGallery(user.uid, user.email!, user.displayName || registerName);

      toast({
        title: "Login effettuato",
        description: `Benvenuto di nuovo, ${user.displayName || user.email}!`,
      });

      onAuthSuccess(user);
      onClose();
    } catch (error: any) {
      console.error('Login error:', error);
      let errorMessage = "Errore durante il login.";
      
      if (error.code === 'auth/user-not-found') {
        errorMessage = "Nessun account trovato con questa email.";
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = "Password non corretta.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Formato email non valido.";
      }

      toast({
        title: "Errore di login",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, registerEmail, registerPassword);
      const user = userCredential.user;

      // Update user profile with name
      await updateProfile(user, {
        displayName: registerName
      });

      // Store user data and gallery association
      await associateUserWithGallery(user.uid, user.email!, registerName);

      // Subscribe to notifications if requested
      if (wantsNotifications) {
        await subscribeToNotifications(user.email!);
      }

      toast({
        title: "Registrazione completata",
        description: `Benvenuto ${registerName}! Ora puoi interagire con la galleria.`,
      });

      onAuthSuccess(user);
      onClose();
    } catch (error: any) {
      console.error('Registration error:', error);
      let errorMessage = "Errore durante la registrazione.";
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = "Esiste già un account con questa email. Prova ad effettuare il login.";
        setActiveTab('login');
        setLoginEmail(registerEmail);
      } else if (error.code === 'auth/weak-password') {
        errorMessage = "La password deve essere di almeno 6 caratteri.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Formato email non valido.";
      }

      toast({
        title: "Errore di registrazione",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const associateUserWithGallery = async (userId: string, email: string, name: string) => {
    try {
      // Store user data
      const userRef = doc(db, 'gallery_users', userId);
      await setDoc(userRef, {
        email,
        name,
        galleryId,
        createdAt: serverTimestamp(),
        lastActive: serverTimestamp()
      }, { merge: true });

      // Store gallery association
      const associationRef = doc(db, 'user_gallery_associations', `${userId}_${galleryId}`);
      await setDoc(associationRef, {
        userId,
        galleryId,
        email,
        name,
        joinedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error associating user with gallery:', error);
    }
  };

  const subscribeToNotifications = async (email: string) => {
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          galleryId,
          galleryName
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to subscribe to notifications');
      }
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      // Non bloccare la registrazione se la sottoscrizione fallisce
    }
  };

  const resetForm = () => {
    setLoginEmail('');
    setLoginPassword('');
    setRegisterName('');
    setRegisterEmail('');
    setRegisterPassword('');
    setWantsNotifications(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Accedi alla Galleria
          </DialogTitle>
          <DialogDescription>
            Accedi o registrati per interagire con la galleria di {galleryName}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'register')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">
              <LogIn className="h-4 w-4 mr-2" />
              Accedi
            </TabsTrigger>
            <TabsTrigger value="register">
              <UserPlus className="h-4 w-4 mr-2" />
              Registrati
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Bentornato!</CardTitle>
                <CardDescription>
                  Accedi con le tue credenziali per continuare a interagire con la galleria
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="la-tua-email@esempio.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="La tua password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4 mr-2" />
                    )}
                    Accedi
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register" className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Unisciti alla galleria!</CardTitle>
                <CardDescription>
                  Crea un account per interagire con foto e vocali
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Nome completo</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Mario Rossi"
                      value={registerName}
                      onChange={(e) => setRegisterName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="la-tua-email@esempio.com"
                      value={registerEmail}
                      onChange={(e) => setRegisterEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Almeno 6 caratteri"
                      value={registerPassword}
                      onChange={(e) => setRegisterPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="notifications"
                      checked={wantsNotifications}
                      onChange={(e) => setWantsNotifications(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <Label htmlFor="notifications" className="text-sm">
                      Ricevi notifiche quando vengono caricate nuove foto
                    </Label>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Registrati
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Benefits section */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-900 mb-3">Cosa puoi fare dopo la registrazione:</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2 text-blue-800">
                  <Heart className="h-4 w-4 text-red-500" />
                  Mettere like
                </div>
                <div className="flex items-center gap-2 text-blue-800">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  Commentare
                </div>
                <div className="flex items-center gap-2 text-blue-800">
                  <Mic2 className="h-4 w-4 text-purple-500" />
                  Vocali segreti
                </div>
                <div className="flex items-center gap-2 text-blue-800">
                  <Bell className="h-4 w-4 text-green-500" />
                  Notifiche foto
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
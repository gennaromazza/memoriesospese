
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { createUrl } from '@/lib/basePath';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { useToast } from '../hooks/use-toast';
import { useFirebaseAuth } from '../context/FirebaseAuthContext';
import Navigation from '../components/Navigation';
import { 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  Save, 
  Loader2,
  Calendar,
  Shield,
  LogOut,
  Camera,
  Settings
} from 'lucide-react';
import { updateProfile, updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import ProfileImageUpload from '../components/ProfileImageUpload';

export default function UserProfile() {
  const { user, isAuthenticated, logout } = useFirebaseAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form state for profile updates
  const [profileData, setProfileData] = useState({
    displayName: '',
    email: '',
    profileImageUrl: ''
  });

  // Form state for password change
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Initialize form data when user data is available
  useEffect(() => {
    if (user) {
      setProfileData({
        displayName: user.displayName || '',
        email: user.email || '',
        profileImageUrl: user.photoURL || ''
      });
    }
  }, [user]);

  // Handler per aggiornamento immagine profilo
  const handleProfileImageUpdate = (newImageUrl: string) => {
    setProfileData(prev => ({
      ...prev,
      profileImageUrl: newImageUrl
    }));
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated) {
      navigate(createUrl('/'));
    }
  }, [isAuthenticated, navigate]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) return;
    
    if (!profileData.displayName.trim()) {
      toast({
        title: "Nome richiesto",
        description: "Il nome non può essere vuoto",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: profileData.displayName.trim()
      });

      // Update Firestore user profile
      await updateDoc(doc(db, 'users', user.uid), {
        displayName: profileData.displayName.trim(),
        updatedAt: serverTimestamp()
      });

      // Refresh user profile data
      await refreshUserProfile();

      toast({
        title: "Profilo aggiornato",
        description: "I tuoi dati sono stati salvati con successo",
      });

    } catch (error: any) {
      console.error('Error updating profile:', error);
      toast({
        title: "Errore",
        description: "Impossibile aggiornare il profilo. Riprova più tardi.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user || !user.email) return;
    
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      toast({
        title: "Campi obbligatori",
        description: "Tutti i campi password sono richiesti",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast({
        title: "Password non corrispondenti",
        description: "La nuova password e la conferma non corrispondono",
        variant: "destructive"
      });
      return;
    }

    if (passwordData.newPassword.length < 6) {
      toast({
        title: "Password troppo corta",
        description: "La nuova password deve essere di almeno 6 caratteri",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Re-authenticate user with current password
      const credential = EmailAuthProvider.credential(user.email, passwordData.currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, passwordData.newPassword);

      // Clear password form
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });

      toast({
        title: "Password aggiornata",
        description: "La tua password è stata cambiata con successo",
      });

    } catch (error: any) {
      console.error('Error updating password:', error);
      let errorMessage = "Impossibile cambiare la password";
      
      if (error.code === 'auth/wrong-password') {
        errorMessage = "Password attuale non corretta";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Troppi tentativi. Riprova più tardi";
      }

      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      
      // Clear local storage
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('gallery_auth_') || 
            key.startsWith('user_email_') || 
            key.startsWith('user_name_') ||
            key === 'userEmail' ||
            key === 'userName' ||
            key === 'isAdmin') {
          localStorage.removeItem(key);
        }
      });
      
      // Navigate to home
      navigate(createUrl('/'));
      
      toast({
        title: "Disconnesso",
        description: "Sei stato disconnesso con successo",
      });
    } catch (error) {
      console.error('Logout error:', error);
      toast({
        title: "Errore",
        description: "Errore durante la disconnessione",
        variant: "destructive"
      });
    }
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-off-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sage mx-auto"></div>
          <p className="mt-4 text-blue-gray">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-off-white">
      <Navigation galleryOwner="Profilo Utente" />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="mx-auto w-20 h-20 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-4">
            <User className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-blue-gray-900 mb-2">Il Mio Profilo</h1>
          <p className="text-sage-700">Gestisci le tue informazioni personali e le impostazioni account</p>
        </div>

        {/* Sezione immagine profilo */}
        <div className="mb-8">
          <ProfileImageUpload
            userId={user?.uid || ''}
            currentImageUrl={profileData.profileImageUrl}
            displayName={profileData.displayName || 'Utente'}
            onImageUpdated={handleProfileImageUpdate}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Profile Information Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Informazioni Profilo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName">Nome completo</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="displayName"
                      type="text"
                      placeholder="Il tuo nome completo"
                      value={profileData.displayName}
                      onChange={(e) => setProfileData({ ...profileData, displayName: e.target.value })}
                      className="pl-10"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="email"
                      type="email"
                      value={profileData.email}
                      className="pl-10 bg-gray-50"
                      disabled
                      title="L'email non può essere modificata"
                    />
                  </div>
                  <p className="text-xs text-gray-500">L'indirizzo email non può essere modificato</p>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Salvataggio...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Save className="w-4 h-4" />
                      Salva Modifiche
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Password Change Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Cambia Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Password attuale</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="currentPassword"
                      type={showCurrentPassword ? 'text' : 'password'}
                      placeholder="Password attuale"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nuova password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="Nuova password (min. 6 caratteri)"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Conferma nuova password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Conferma nuova password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="pl-10 pr-10"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-700 hover:to-pink-700"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Aggiornamento...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Cambia Password
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Account Information */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Informazioni Account
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Tipo Account</p>
                  <p className="text-xs text-gray-600">Il tuo ruolo nel sistema</p>
                </div>
                <Badge variant="secondary">
                  Ospite
                </Badge>
              </div>
              
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Membro da</p>
                  <p className="text-xs text-gray-600">Data di registrazione</p>
                </div>
                <p className="text-sm font-medium">
                  {user?.metadata?.creationTime ? 
                    new Date(user.metadata.creationTime).toLocaleDateString('it-IT') : 
                    'N/A'
                  }
                </p>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Gallerie Accessibili</p>
                  <p className="text-xs text-gray-600">Numero di gallerie a cui hai accesso</p>
                </div>
                <Badge variant="outline">
                  0
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">Ultimo Accesso</p>
                  <p className="text-xs text-gray-600">Ultima volta online</p>
                </div>
                <p className="text-sm font-medium">
                  {user?.metadata?.lastSignInTime ? 
                    new Date(user.metadata.lastSignInTime).toLocaleDateString('it-IT') : 
                    'N/A'
                  }
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Logout Section */}
        <Card className="mt-6 border-red-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-red-900">Disconnetti Account</h3>
                <p className="text-sm text-red-700">Esci dal tuo account su questo dispositivo</p>
              </div>
              <Button
                onClick={handleLogout}
                variant="destructive"
                className="flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Disconnetti
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useFirebaseAuth } from '@/context/FirebaseAuthContext';
import { 
  User, 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  LogIn, 
  UserPlus,
  KeyRound,
  Loader2
} from 'lucide-react';

interface UnifiedAuthDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  galleryId: string;
  onAuthComplete: () => void;
  defaultTab?: 'login' | 'register';
}

export default function UnifiedAuthDialog({
  isOpen,
  onOpenChange,
  galleryId,
  onAuthComplete,
  defaultTab = 'login'
}: UnifiedAuthDialogProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  // Register form state
  const [registerData, setRegisterData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    displayName: ''
  });

  // Reset password state
  const [resetEmail, setResetEmail] = useState('');
  const [showResetForm, setShowResetForm] = useState(false);

  const { login, register, resetPassword } = useFirebaseAuth();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!loginData.email.trim() || !loginData.password.trim()) {
      toast({
        title: "Campi obbligatori",
        description: "Email e password sono richiesti",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const user = await login(loginData.email.trim(), loginData.password, galleryId);
      
      toast({
        title: "Accesso effettuato",
        description: "Benvenuto! Ora puoi interagire con la galleria",
      });
      
      onAuthComplete();
      onOpenChange(false);
      
      // Reset form
      setLoginData({ email: '', password: '' });
    } catch (error: any) {
      toast({
        title: "Errore di accesso",
        description: error.message || "Credenziali non valide",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!registerData.email.trim() || !registerData.password.trim() || !registerData.displayName.trim()) {
      toast({
        title: "Campi obbligatori",
        description: "Tutti i campi sono richiesti per la registrazione",
        variant: "destructive"
      });
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      toast({
        title: "Password non corrispondenti",
        description: "Le password inserite non corrispondono",
        variant: "destructive"
      });
      return;
    }

    if (registerData.password.length < 6) {
      toast({
        title: "Password troppo corta",
        description: "La password deve essere di almeno 6 caratteri",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const user = await register(
        registerData.email.trim(),
        registerData.password,
        registerData.displayName.trim(),
        'guest',
        galleryId

      );
      
      toast({
        title: "Registrazione completata",
        description: "Account creato con successo! Ora puoi interagire con la galleria",
      });
      
      onAuthComplete();
      onOpenChange(false);
      
      // Reset form
      setRegisterData({ email: '', password: '', confirmPassword: '', displayName: '' });
    } catch (error: any) {
      toast({
        title: "Errore di registrazione",
        description: error.message || "Impossibile creare l'account",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail.trim()) {
      toast({
        title: "Email richiesta",
        description: "Inserisci la tua email per recuperare la password",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      await resetPassword(resetEmail.trim());
      
      toast({
        title: "Email inviata",
        description: "Controlla la tua email per reimpostare la password",
      });
      setShowResetForm(false);
      setResetEmail('');
    } catch (error: any) {
      toast({
        title: "Errore",
        description: error.message || "Impossibile inviare l'email di recupero",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForms = () => {
    setLoginData({ email: '', password: '' });
    setRegisterData({ email: '', password: '', confirmPassword: '', displayName: '' });
    setResetEmail('');
    setShowResetForm(false);
    setShowPassword(false);
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetForms();
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" aria-describedby="auth-dialog-description">
        <DialogHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-3">
            <User className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-xl font-bold text-blue-gray-900">
            Accedi alla Galleria
          </DialogTitle>
          <DialogDescription id="auth-dialog-description" className="text-sage-700 mt-2">
            Accedi o registrati per mettere like e commentare
          </DialogDescription>
        </DialogHeader>

        {showResetForm ? (
          <form onSubmit={handleResetPassword} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-sage-700 font-medium text-sm">
                Email per recupero password
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="La tua email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                type="submit"
                disabled={isLoading || !resetEmail.trim()}
                className="flex-1 bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Invio...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <KeyRound className="w-4 h-4" />
                    Invia Email
                  </div>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowResetForm(false)}
                disabled={isLoading}
              >
                Annulla
              </Button>
            </div>
          </form>
        ) : (
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'login' | 'register')} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login" className="flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                Accedi
              </TabsTrigger>
              <TabsTrigger value="register" className="flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Registrati
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="space-y-4 mt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email" className="text-sage-700 font-medium text-sm">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="La tua email"
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="login-password" className="text-sage-700 font-medium text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="La tua password"
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      className="pl-10 pr-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                      disabled={isLoading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowResetForm(true)}
                    className="text-sm text-sage-600 hover:text-sage-700 hover:underline"
                    disabled={isLoading}
                  >
                    Password dimenticata?
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || !loginData.email.trim() || !loginData.password.trim()}
                  className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Accesso...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <LogIn className="w-4 h-4" />
                      Accedi
                    </div>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="space-y-4 mt-4">
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-name" className="text-sage-700 font-medium text-sm">
                    Nome completo
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Il tuo nome"
                      value={registerData.displayName}
                      onChange={(e) => setRegisterData({ ...registerData, displayName: e.target.value })}
                      className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-email" className="text-sage-700 font-medium text-sm">
                    Email
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="La tua email"
                      value={registerData.email}
                      onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })}
                      className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-password" className="text-sage-700 font-medium text-sm">
                    Password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Scegli una password (min. 6 caratteri)"
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      className="pl-10 pr-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                      disabled={isLoading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      disabled={isLoading}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="register-confirm-password" className="text-sage-700 font-medium text-sm">
                    Conferma password
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="register-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Conferma la password"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                      className="pl-10 border-gray-300 focus:border-sage-500 focus:ring-sage-500"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Privacy:</strong> I tuoi dati vengono utilizzati solo per identificarti 
                    nei like e nei commenti. Non verranno condivisi con terze parti.
                  </p>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading || !registerData.email.trim() || !registerData.password.trim() || !registerData.displayName.trim()}
                  className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                >
                  {isLoading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creazione...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <UserPlus className="w-4 h-4" />
                      Crea Account
                    </div>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
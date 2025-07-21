import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useToast } from '../hooks/use-toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Camera, Eye, EyeOff, ArrowLeft, Mail } from 'lucide-react';
import { createUrl } from '../lib/basePath';

export default function PhotographerLogin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [resetEmail, setResetEmail] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      
      toast({
        title: "Accesso effettuato!",
        description: "Benvenuto in Memorie Sospese"
      });

      // Redirect to dashboard or profile
      navigate(createUrl('/profile'));

    } catch (error: any) {
      console.error('Login error:', error);
      
      let errorMessage = "Errore durante l'accesso";
      if (error.code === 'auth/user-not-found') {
        errorMessage = "Account non trovato. Verifica l'email o registrati.";
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = "Password errata.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Email non valida.";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Troppi tentativi falliti. Riprova più tardi.";
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

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!resetEmail) {
      toast({
        title: "Errore",
        description: "Inserisci la tua email",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      
      toast({
        title: "Email inviata!",
        description: "Controlla la tua casella di posta per reimpostare la password"
      });
      
      setShowResetForm(false);
      setResetEmail('');

    } catch (error: any) {
      console.error('Reset password error:', error);
      
      let errorMessage = "Errore durante l'invio dell'email";
      if (error.code === 'auth/user-not-found') {
        errorMessage = "Email non trovata. Verifica l'indirizzo inserito.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Email non valida.";
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-off-white via-sage-50 to-blue-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Back to Landing */}
        <div className="text-center">
          <Link href={createUrl('/landing')}>
            <Button variant="ghost" className="text-sage-600 hover:text-sage-700 mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Torna alla Landing
            </Button>
          </Link>
        </div>

        <Card className="border-sage-200 shadow-lg">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gradient-to-r from-sage-600 to-blue-gray-600 rounded-full flex items-center justify-center mb-4">
              <Camera className="h-8 w-8 text-white" />
            </div>
            <CardTitle className="text-2xl font-bold text-blue-gray-900">
              {showResetForm ? 'Reimposta Password' : 'Accedi come Fotografo'}
            </CardTitle>
            <p className="text-sage-600 mt-2">
              {showResetForm 
                ? 'Inserisci la tua email per ricevere il link di reset' 
                : 'Accedi al tuo account professionale'}
            </p>
          </CardHeader>
          
          <CardContent>
            {showResetForm ? (
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div>
                  <Label htmlFor="resetEmail">Email</Label>
                  <Input
                    id="resetEmail"
                    name="resetEmail"
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="mt-1"
                    placeholder="mario@esempio.it"
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowResetForm(false)}
                    className="flex-1"
                  >
                    Annulla
                  </Button>
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="flex-1 bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                  >
                    {isLoading ? 'Invio...' : 'Invia Email'}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="mt-1"
                    placeholder="mario@esempio.it"
                  />
                </div>

                <div className="relative">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={handleInputChange}
                      className="pr-10"
                      placeholder="La tua password"
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      ) : (
                        <Eye className="h-4 w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowResetForm(true)}
                    className="text-sm text-sage-600 hover:text-sage-700 underline"
                  >
                    Password dimenticata?
                  </button>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-sage-600 to-blue-gray-600 hover:from-sage-700 hover:to-blue-gray-700"
                >
                  {isLoading ? 'Accesso...' : 'Accedi'}
                </Button>
              </form>
            )}

            {!showResetForm && (
              <div className="mt-6 text-center">
                <p className="text-sm text-gray-600">
                  Non hai ancora un account?{' '}
                  <Link href={createUrl('/photographer-register')} className="text-sage-600 hover:text-sage-700 font-medium underline">
                    Registrati gratis
                  </Link>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Additional Options */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-4">
            Oppure accedi come ospite di un matrimonio
          </p>
          <Link href={createUrl('/')}>
            <Button variant="outline" className="border-sage-300 text-sage-700 hover:bg-sage-50">
              <Mail className="w-4 h-4 mr-2" />
              Accedi a una Galleria
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
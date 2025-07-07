import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import {
  FloralCorner,
  FloralDivider,
  BackgroundDecoration,
} from "@/components/WeddingIllustrations";
import { WeddingImage, DecorativeImage } from "@/components/WeddingImages";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { createUrl, createAbsoluteUrl } from "@/lib/basePath";

const loginSchema = z.object({
  email: z.string().email("Inserisci un'email valida"),
  password: z.string().min(6, "La password deve contenere almeno 6 caratteri"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function AdminLogin() {
  const [isLoading, setIsLoading] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // Se c'è già un flag isAdmin nel localStorage, reindirizza alla dashboard
  useEffect(() => {
    if (localStorage.getItem("isAdmin")) {
      navigate(createUrl("/admin/dashboard"));
    }
  }, [navigate]);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      // Utilizziamo direttamente le API di Firebase anziché l'AuthContext
      await signInWithEmailAndPassword(auth, data.email, data.password);
      // Salva informazione che l'utente è un amministratore
      localStorage.setItem("isAdmin", "true");
      
      // Usa l'URL assoluto per garantire un reindirizzamento corretto
      const dashboardUrl = createAbsoluteUrl("/admin/dashboard");
      
      navigate(dashboardUrl);
    } catch (error: any) {
      
      let errorMessage = "Si è verificato un errore durante l'accesso.";

      // Handle specific Firebase auth errors
      if (
        error.code === "auth/user-not-found" ||
        error.code === "auth/wrong-password"
      ) {
        errorMessage = "Email o password non validi.";
      } else if (error.code === "auth/too-many-requests") {
        errorMessage = "Troppi tentativi di accesso. Riprova più tardi.";
      }

      toast({
        title: "Errore di accesso",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-off-white flex flex-col relative">
      {/* Decorazioni floreali agli angoli */}
      <div className="absolute top-0 left-0 w-32 h-32 opacity-15 pointer-events-none">
        <WeddingImage
          type="flower-bouquet"
          className="w-full h-auto"
          alt="Decorazione floreale"
        />
      </div>
      <div className="absolute top-0 right-0 w-32 h-32 opacity-15 pointer-events-none">
        <WeddingImage
          type="flower-bouquet"
          className="w-full h-auto transform scale-x-[-1]"
          alt="Decorazione floreale"
        />
      </div>

      <Navigation />

      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="w-24 h-24 mx-auto mb-4">
              <WeddingImage
                type="standing"
                className="w-full h-auto opacity-40"
                alt="Icona amministratore"
              />
            </div>
            <h2 className="mt-6 text-3xl font-bold text-blue-gray font-playfair">
              Accesso Admin
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Accedi per gestire le gallerie fotografiche
            </p>
            <div className="w-full max-w-xs mx-auto h-6 opacity-20 my-4">
              <FloralDivider />
            </div>
          </div>

          <Card className="border-sage/20 shadow-md overflow-hidden">
            <div className="absolute inset-0 opacity-5 pointer-events-none">
              <BackgroundDecoration />
            </div>
            <CardContent className="pt-6 relative z-10">
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-blue-gray"
                  >
                    Email
                  </label>
                  <div className="mt-1">
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      {...form.register("email")}
                      className="appearance-none block w-full px-3 py-2 border border-beige rounded-md shadow-sm focus:ring-sage focus:border-sage"
                    />
                    {form.formState.errors.email && (
                      <p className="mt-1 text-sm text-red-500">
                        {form.formState.errors.email.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-blue-gray"
                  >
                    Password
                  </label>
                  <div className="mt-1">
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      {...form.register("password")}
                      className="appearance-none block w-full px-3 py-2 border border-beige rounded-md shadow-sm focus:ring-sage focus:border-sage"
                    />
                    {form.formState.errors.password && (
                      <p className="mt-1 text-sm text-red-500">
                        {form.formState.errors.password.message}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Button
                    type="submit"
                    className="w-full btn-primary py-2 px-4 rounded-md"
                    disabled={isLoading}
                  >
                    {isLoading ? "Accesso in corso..." : "Accedi"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      <Footer />
    </div>
  );
}

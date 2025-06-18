import { useState, useEffect } from "react";
import { useParams, Link, useLocation } from "wouter";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { usePasswordRequest } from "@/hooks/use-password-request";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Check, X, AlertCircle } from "lucide-react";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { FloralCorner, FloralDivider, BackgroundDecoration } from '@/components/WeddingIllustrations';
import { WeddingImage, DecorativeImage } from '@/components/WeddingImages';
import { createUrl } from '@/lib/basePath';

const requestSchema = z.object({
  firstName: z.string()
    .min(2, "Il nome deve contenere almeno 2 caratteri")
    .max(50, "Il nome non può superare i 50 caratteri")
    .regex(/^[a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ ,.'-]+$/, 
      "Il nome può contenere solo lettere, spazi e caratteri speciali ,.'-"),
  lastName: z.string()
    .min(2, "Il cognome deve contenere almeno 2 caratteri")
    .max(50, "Il cognome non può superare i 50 caratteri")
    .regex(/^[a-zA-ZàáâäãåąčćęèéêëėįìíîïłńòóôöõøùúûüųūÿýżźñçčšžÀÁÂÄÃÅĄĆČĖĘÈÉÊËÌÍÎÏĮŁŃÒÓÔÖÕØÙÚÛÜŲŪŸÝŻŹÑßÇŒÆČŠŽ ,.'-]+$/, 
      "Il cognome può contenere solo lettere, spazi e caratteri speciali ,.'-"),
  email: z.string()
    .min(5, "L'email deve contenere almeno 5 caratteri")
    .max(100, "L'email non può superare i 100 caratteri")
    .email("Inserisci un'email valida")
    .refine(email => email.includes("@") && email.includes("."), {
      message: "L'email deve contenere una @ e un punto (.)"
    }),
  relation: z.string().min(1, "Seleziona una relazione"),
});

type RequestFormData = z.infer<typeof requestSchema>;

export default function RequestPassword() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [success, setSuccess] = useState(false);
  const [showSecurityQuestion, setShowSecurityQuestion] = useState(false);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [finalPassword, setFinalPassword] = useState("");
  const { toast } = useToast();
  
  const { getGalleryInfo, submitPasswordRequest, galleryInfo, isLoading, error } = usePasswordRequest();

  const form = useForm<RequestFormData>({
    resolver: zodResolver(requestSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      relation: "",
    },
    mode: "onChange", // Abilita la validazione in tempo reale mentre l'utente digita
  });

  // Check if the gallery exists on component mount
  useEffect(() => {
    async function loadGalleryInfo() {
      if (!id) return;
      
      try {
        await getGalleryInfo(id);
      } catch (error) {
        toast({
          title: "Errore",
          description: "Non è stato possibile verificare la galleria.",
          variant: "destructive",
        });
      }
    }
    
    loadGalleryInfo();
  }, [id, getGalleryInfo, toast]);

  const onSubmit = async (data: RequestFormData) => {
    if (!id || !galleryInfo) return;
    
    try {
      const result = await submitPasswordRequest({
        galleryId: id,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        relation: data.relation
      });

      if (result.requiresSecurityQuestion) {
        setShowSecurityQuestion(true);
        return;
      }

      if (result.success && result.password) {
        setFinalPassword(result.password);
        setSuccess(true);
        
        toast({
          title: "Richiesta completata!",
          description: "La password è ora disponibile qui sotto.",
        });
      }
      
    } catch (error) {
      toast({
        title: "Errore",
        description: error instanceof Error ? error.message : "Si è verificato un errore durante l'invio della richiesta.",
        variant: "destructive",
      });
    }
  };

  const handleSecurityAnswer = async () => {
    if (!id || !galleryInfo || !securityAnswer.trim()) {
      setSecurityError("La risposta è obbligatoria");
      return;
    }

    setSecurityError("");

    try {
      const formData = form.getValues();
      const result = await submitPasswordRequest({
        galleryId: id,
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        relation: formData.relation,
        securityAnswer: securityAnswer.trim()
      });

      if (result.success && result.password) {
        setFinalPassword(result.password);
        setSuccess(true);
        setShowSecurityQuestion(false);
        
        toast({
          title: "Accesso autorizzato!",
          description: "La password è ora disponibile qui sotto.",
        });
      }
      
    } catch (error) {
      setSecurityError(error instanceof Error ? error.message : "Errore durante la verifica");
    }
  };

  return (
    <div className="min-h-screen bg-off-white flex flex-col relative">
      {/* Decorazioni */}
      <div className="absolute top-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="top-left" />
      </div>
      <div className="absolute top-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="top-right" />
      </div>
      <div className="absolute bottom-0 left-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="bottom-left" />
      </div>
      <div className="absolute bottom-0 right-0 w-40 h-40 opacity-10 pointer-events-none">
        <FloralCorner position="bottom-right" />
      </div>
      
      <Navigation />
      
      <div className="flex-grow flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 relative z-10">
          {!galleryInfo ? (
            <Card className="border-sage/20 shadow-md overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <BackgroundDecoration />
              </div>
              <CardContent className="pt-8 relative z-10">
                <div className="text-center">
                  <div className="w-32 h-32 mx-auto mb-4">
                    <WeddingImage type="heart-balloon" className="w-full h-auto opacity-30" alt="Decorazione a tema matrimonio" />
                  </div>
                  <h2 className="text-2xl font-bold text-blue-gray font-playfair mb-4">
                    Galleria non trovata
                  </h2>
                  <p className="text-gray-600 mb-6">
                    La galleria che stai cercando non esiste o è stata rimossa.
                  </p>
                  <Link href={createUrl("/")}>
                    <Button className="btn-primary">Torna alla Home</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : success ? (
            <Card className="border-sage/20 shadow-md overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <BackgroundDecoration />
              </div>
              <CardContent className="pt-8 relative z-10">
                <div className="text-center">
                  <div className="w-40 h-40 mx-auto mb-6">
                    <WeddingImage type="wedding-cake" className="w-full h-auto opacity-60" alt="Torta nuziale" />
                  </div>
                  <h2 className="text-2xl font-bold text-blue-gray font-playfair mb-2">
                    Password Disponibile
                  </h2>
                  <p className="text-gray-600 mb-4">
                    La tua richiesta è stata approvata. Ecco la password per accedere alla galleria:
                  </p>
                  <div className="bg-sage/10 border border-sage/30 rounded-lg p-4 mb-6">
                    <div className="text-lg font-mono font-bold text-blue-gray">
                      {finalPassword}
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-4 justify-center">
                    <Link href={createUrl(`/gallery/${id}`)}>
                      <Button className="btn-primary">Accedi alla Galleria</Button>
                    </Link>
                    <Link href={createUrl("/")}>
                      <Button variant="outline">Torna alla Home</Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : showSecurityQuestion ? (
            <Card className="border-sage/20 shadow-md overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <BackgroundDecoration />
              </div>
              <CardContent className="pt-8 relative z-10">
                <div className="text-center">
                  <div className="w-32 h-32 mx-auto mb-4">
                    <WeddingImage type="heart-balloon" className="w-full h-auto opacity-30" alt="Decorazione a tema matrimonio" />
                  </div>
                  <h2 className="text-2xl font-bold text-blue-gray font-playfair mb-4">
                    Domanda di Sicurezza
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Per completare la richiesta, rispondi alla domanda di sicurezza:
                  </p>
                  
                  <div className="text-left space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-blue-gray mb-2">
                        {galleryInfo?.securityQuestion}
                      </label>
                      <Input
                        value={securityAnswer}
                        onChange={(e) => setSecurityAnswer(e.target.value)}
                        placeholder="Inserisci la tua risposta"
                        className="w-full"
                        autoFocus
                      />
                      {securityError && (
                        <p className="mt-1 text-sm text-red-500">{securityError}</p>
                      )}
                    </div>
                    
                    <div className="flex space-x-3">
                      <Button 
                        onClick={handleSecurityAnswer}
                        disabled={isLoading || !securityAnswer.trim()}
                        className="btn-primary flex-1"
                      >
                        {isLoading ? "Verifica..." : "Conferma"}
                      </Button>
                      <Button 
                        variant="outline"
                        onClick={() => {
                          setShowSecurityQuestion(false);
                          setSecurityAnswer("");
                          setSecurityError("");
                        }}
                      >
                        Indietro
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-sage/20 shadow-md overflow-hidden">
              <div className="absolute inset-0 opacity-5 pointer-events-none">
                <BackgroundDecoration />
              </div>
              <CardContent className="pt-8 relative z-10">
                <div className="text-center mb-6">
                  <div className="w-32 h-32 mx-auto mb-4">
                    <WeddingImage type="standing" className="w-full h-auto opacity-60" alt="Coppia di sposi" />
                  </div>
                  <h2 className="text-2xl font-bold text-blue-gray font-playfair">
                    Richiedi la Password
                  </h2>
                  {galleryInfo?.name && (
                    <p className="mt-2 text-gray-600">
                      Galleria: <span className="font-medium">{galleryInfo.name}</span>
                    </p>
                  )}
                  <p className="mt-2 text-gray-600">
                    Compila il form per ricevere la password della galleria
                  </p>
                  <div className="w-full max-w-xs mx-auto h-8 opacity-20 my-6">
                    <FloralDivider />
                  </div>
                </div>
                
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid grid-cols-1 gap-y-6 sm:grid-cols-2 sm:gap-x-4">
                    <div>
                      <label htmlFor="firstName" className="block text-sm font-medium text-blue-gray">
                        Nome
                      </label>
                      <div className="mt-1 relative">
                        <Input
                          id="firstName"
                          {...form.register("firstName")}
                          className={`w-full border-beige rounded-md py-3 px-4 pr-10 focus:ring-sage focus:border-sage
                            ${form.formState.errors.firstName ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}
                            ${form.formState.dirtyFields.firstName && !form.formState.errors.firstName ? "border-green-500 focus:ring-green-500 focus:border-green-500" : ""}`}
                          aria-invalid={form.formState.errors.firstName ? "true" : "false"}
                        />
                        {form.formState.dirtyFields.firstName && (
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            {form.formState.errors.firstName ? (
                              <X className="h-4 w-4 text-red-500" />
                            ) : (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                        )}
                        {form.formState.errors.firstName && (
                          <div className="flex items-center mt-1">
                            <AlertCircle className="h-3 w-3 text-red-500 mr-1" />
                            <p className="text-sm text-red-500">{form.formState.errors.firstName.message}</p>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <label htmlFor="lastName" className="block text-sm font-medium text-blue-gray">
                        Cognome
                      </label>
                      <div className="mt-1 relative">
                        <Input
                          id="lastName"
                          {...form.register("lastName")}
                          className={`w-full border-beige rounded-md py-3 px-4 pr-10 focus:ring-sage focus:border-sage
                            ${form.formState.errors.lastName ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}
                            ${form.formState.dirtyFields.lastName && !form.formState.errors.lastName ? "border-green-500 focus:ring-green-500 focus:border-green-500" : ""}`}
                          aria-invalid={form.formState.errors.lastName ? "true" : "false"}
                        />
                        {form.formState.dirtyFields.lastName && (
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            {form.formState.errors.lastName ? (
                              <X className="h-4 w-4 text-red-500" />
                            ) : (
                              <Check className="h-4 w-4 text-green-500" />
                            )}
                          </div>
                        )}
                        {form.formState.errors.lastName && (
                          <div className="flex items-center mt-1">
                            <AlertCircle className="h-3 w-3 text-red-500 mr-1" />
                            <p className="text-sm text-red-500">{form.formState.errors.lastName.message}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-blue-gray">
                      Email
                    </label>
                    <div className="mt-1 relative">
                      <Input
                        id="email"
                        type="email"
                        {...form.register("email")}
                        className={`w-full border-beige rounded-md py-3 px-4 pr-10 focus:ring-sage focus:border-sage
                          ${form.formState.errors.email ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}
                          ${form.formState.dirtyFields.email && !form.formState.errors.email ? "border-green-500 focus:ring-green-500 focus:border-green-500" : ""}`}
                        aria-invalid={form.formState.errors.email ? "true" : "false"}
                        placeholder="esempio@mail.com"
                      />
                      {form.formState.dirtyFields.email && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                          {form.formState.errors.email ? (
                            <X className="h-4 w-4 text-red-500" />
                          ) : (
                            <Check className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                      )}
                      {form.formState.errors.email && (
                        <div className="flex items-center mt-1">
                          <AlertCircle className="h-3 w-3 text-red-500 mr-1" />
                          <p className="text-sm text-red-500">{form.formState.errors.email.message}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label htmlFor="relation" className="block text-sm font-medium text-blue-gray">
                      Relazione con gli sposi
                    </label>
                    <div className="mt-1 relative">
                      <Select 
                        onValueChange={(value) => {
                          form.setValue("relation", value);
                          form.trigger("relation"); // Forza la validazione dopo la selezione
                        }}
                      >
                        <SelectTrigger 
                          className={`w-full border-beige rounded-md focus:ring-sage focus:border-sage
                            ${form.formState.errors.relation ? "border-red-500 focus:ring-red-500 focus:border-red-500" : ""}
                            ${form.formState.dirtyFields.relation && !form.formState.errors.relation ? "border-green-500 focus:ring-green-500 focus:border-green-500" : ""}`}
                        >
                          <SelectValue placeholder="Seleziona..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="family">Famiglia</SelectItem>
                          <SelectItem value="friend">Amico/a</SelectItem>
                          <SelectItem value="colleague">Collega</SelectItem>
                          <SelectItem value="other">Altro</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.formState.errors.relation && (
                        <div className="flex items-center mt-1">
                          <AlertCircle className="h-3 w-3 text-red-500 mr-1" />
                          <p className="text-sm text-red-500">{form.formState.errors.relation.message}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <Button
                      type="submit"
                      className="w-full btn-primary py-3 relative group overflow-hidden"
                      disabled={isLoading}
                    >
                      <span className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity">
                        <BackgroundDecoration />
                      </span>
                      <span className="relative z-10">
                        {isLoading ? "Invio in corso..." : "Richiedi Password"}
                      </span>
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      
      <Footer />
    </div>
  );
}
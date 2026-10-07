import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { collection, writeBatch, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useIsAdmin } from "@/hooks/useIsAdmin";

const FIRESTORE_COLLECTIONS = [
  "bookings",
  "comments",
  "consultations",
  "consultationTemplates",
  "contractClauses",
  "coupleStories",
  "faqSets",
  "galleries",
  "gallery-photos",
  "jobs",
  "likes",
  "orders",
  "passwordRequests",
  "paymentSchedules",
  "photos",
  "products",
  "questionnaireTokens",
  "quotes",
  "slideshow",
  "subscriptions",
  "users",
  "validationSessions",
  "voice-memos",
  "voiceMemos",
];

export default function AdminJsonImporter() {
  const isAdmin = useIsAdmin();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [jsonText, setJsonText] = useState("");
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [targetCollection, setTargetCollection] = useState("");

  if (!isAdmin) {
    return (
      <div className="max-w-7xl mx-auto py-6 px-4 text-center">
        <h1 className="text-2xl font-bold text-red-600">Accesso Negato</h1>
        <p className="mt-4">Solo gli amministratori possono accedere a questa pagina.</p>
        <Button onClick={() => navigate("/admin")} className="mt-4">
          Vai alla Dashboard Admin
        </Button>
      </div>
    );
  }

  const handleParse = () => {
    try {
      const data = JSON.parse(jsonText);
      if (!Array.isArray(data)) throw new Error("Il JSON deve essere un array di oggetti");
      setParsedData(data);
      setStep(2);
      toast({ title: "JSON Caricato", description: "Procedi alla mappatura dei campi." });
    } catch (err: any) {
      toast({ title: "Errore JSON", description: err.message, variant: "destructive" });
    }
  };

  const example = parsedData[0] || {};

  const handleFieldMapping = (jsonField: string, firestoreField: string) => {
    setMapping((prev) => ({ ...prev, [jsonField]: firestoreField }));
  };

  const handleImport = async () => {
    if (!targetCollection) {
      toast({ title: "Seleziona una collezione" });
      return;
    }

    try {
      const BATCH_LIMIT = 450;
      let batch = writeBatch(db);
      let operations = 0;

      for (const item of parsedData) {
        const mapped: any = {};
        Object.entries(mapping).forEach(([jsonKey, fsKey]) => {
          if (fsKey.trim() !== "") mapped[fsKey] = item[jsonKey];
        });

        const newRef = doc(collection(db, targetCollection));
        batch.set(newRef, { ...mapped, importedAt: new Date() });

        operations++;
        if (operations >= BATCH_LIMIT) {
          await batch.commit();
          batch = writeBatch(db);
          operations = 0;
        }
      }

      if (operations > 0) await batch.commit();

      toast({
        title: "Importazione completata",
        description: `${parsedData.length} documenti importati correttamente.`,
      });

      setStep(4);
    } catch (err: any) {
      toast({
        title: "Errore durante l'importazione",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 lg:px-8">
      <h1 className="text-3xl font-bold mb-6">Importatore JSON</h1>

      <Card>
        <CardHeader>
          <CardTitle>Step {step} di 4</CardTitle>
        </CardHeader>

        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <Label>Incolla un JSON Array</Label>
              <Textarea
                rows={15}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
              />
              <Button onClick={handleParse}>Carica JSON</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold">Mappa i campi</h2>

              {Object.keys(example).map((key) => (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-1/3 text-sm font-mono">{key}</div>

                  <Input
                    className="w-2/3"
                    placeholder="Nome campo Firestore"
                    onChange={(e) => handleFieldMapping(key, e.target.value)}
                  />
                </div>
              ))}

              <Button onClick={() => setStep(3)}>Continua</Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <Label>Seleziona collezione Firestore</Label>
              <select
                className="w-full p-3 border rounded"
                value={targetCollection}
                onChange={(e) => setTargetCollection(e.target.value)}
              >
                <option value="">-- Seleziona --</option>
                {FIRESTORE_COLLECTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <Button onClick={handleImport}>Importa tutto</Button>
            </div>
          )}

          {step === 4 && (
            <div className="text-center space-y-4">
              <p className="text-lg font-semibold">🎉 Importazione completata!</p>
              <Button onClick={() => navigate("/admin/dashboard")}>
                Torna alla Dashboard
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
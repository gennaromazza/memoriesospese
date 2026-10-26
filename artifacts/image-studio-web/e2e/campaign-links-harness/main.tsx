import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { Route, Router, Switch } from "wouter";
import { signInWithEmailAndPassword } from "firebase/auth";
import BookingPage from "../../src/pages/BookingPage";
import CampaignsManager from "../../src/components/CampaignsManager";
import { auth } from "../../src/lib/firebase";
import { queryClient } from "../../src/lib/queryClient";
import "../../src/index.css";

const testAdminEmail = "gennaro.mazzacane@gmail.com";
const testAdminPassword = "campaign-links-e2e-password";

function AuthenticatedCampaignManager() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    signInWithEmailAndPassword(auth, testAdminEmail, testAdminPassword)
      .then(() => setReady(true))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
  }, []);

  if (error) {
    return <p role="alert">Accesso di test non riuscito: {error}</p>;
  }
  if (!ready) {
    return <p>Accesso di test in corso…</p>;
  }
  return <CampaignsManager />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Switch>
          <Route path="/admin/campaigns" component={AuthenticatedCampaignManager} />
          <Route path="/prenota/:code" component={BookingPage} />
          <Route>Pagina test non trovata</Route>
        </Switch>
      </Router>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

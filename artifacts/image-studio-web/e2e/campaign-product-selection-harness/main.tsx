import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "../../src/index.css";
import CampaignsManager from "../../src/components/CampaignsManager";
import { queryClient } from "./stubs/queryClient";
import { resetMockFirestore } from "./stubs/firestore";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-5xl p-6">
        <h1>Test selezione prodotti campagna</h1>
        <CampaignsManager />
      </main>
    </QueryClientProvider>
  );
}

resetMockFirestore();
createRoot(document.getElementById("root")!).render(<App />);

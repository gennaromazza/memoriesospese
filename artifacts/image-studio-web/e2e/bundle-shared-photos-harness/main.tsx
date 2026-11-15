import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ProductsManager from "../../src/components/ProductsManager";
import { resetMockFirestore } from "./stubs/firestore";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function App() {
  const [toast, setToast] = useState<{ title?: string; description?: string } | null>(null);

  useEffect(() => {
    const handleToast = (event: Event) => {
      setToast((event as CustomEvent).detail);
    };
    window.addEventListener("bundle-harness-toast", handleToast);
    return () => window.removeEventListener("bundle-harness-toast", handleToast);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-5xl p-6">
        <h1>Test editor bundle</h1>
        {toast && (
          <div role="alert" data-testid="harness-toast">
            {toast.title}: {toast.description}
          </div>
        )}
        <ProductsManager />
      </main>
    </QueryClientProvider>
  );
}

resetMockFirestore();
createRoot(document.getElementById("root")!).render(<App />);

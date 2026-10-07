import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./harness.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./stubs/queryClient";
import PrintShopOrdersManager from "../../src/components/print-shop/PrintShopOrdersManager";
import PrintShopConfirmationPage from "../../src/pages/public/PrintShopConfirmationPage";
import PrintShopOrdersPage from "../../src/pages/public/PrintShopOrdersPage";
import PrintShopOrderPage from "../../src/pages/public/PrintShopOrderPage";
import { WhatsAppHelp } from "../../src/features/print-shop/WhatsAppHelp";
import { installNotificationFixtures } from './notification-fixtures';

installNotificationFixtures();

declare global { interface Window { __harnessErrors: string[] } }
window.__harnessErrors = [];
window.addEventListener("error", (event) => window.__harnessErrors.push(event.message));
window.addEventListener("unhandledrejection", (event) => window.__harnessErrors.push(String(event.reason)));
function App() {
  const [path, setPath] = useState(window.location.pathname);
  const [toast, setToast] = useState<any>(null);
  useEffect(() => {
    const pop = () => setPath(window.location.pathname);
    const onToast = (event: any) => setToast(event.detail);
    window.addEventListener("popstate", pop);
    window.addEventListener("harness-toast", onToast);
    const timer = window.setInterval(pop, 50);
    return () => { window.removeEventListener("popstate", pop); window.removeEventListener("harness-toast", onToast); window.clearInterval(timer); };
  }, []);
  const view = new URLSearchParams(window.location.search).get("view") || "admin";
  const component = path.includes("/ordine/conferma") ? <PrintShopConfirmationPage />
    : path.includes("/i-miei-ordini") ? <PrintShopOrdersPage />
    : path.includes("/ordine") ? <PrintShopOrderPage />
    : view === "confirmation" ? <PrintShopConfirmationPage />
    : view === "orders" ? <PrintShopOrdersPage />
    : view === "order" ? <PrintShopOrderPage />
    : view === "whatsapp" ? <section><WhatsAppHelp /><WhatsAppHelp orderNumber="PS-483-0123" /></section>
    : <PrintShopOrdersManager />;
  return <QueryClientProvider client={queryClient}><main><h1>Isolated print deferred-payment harness</h1>
    <nav><a href="/?view=admin">Admin</a> · <a href="/?view=confirmation&orderId=deferred-1">Confirmation</a> · <a href="/?view=orders">Customer orders</a> · <a href="/?view=whatsapp">WhatsApp</a></nav>
    {toast && <div role="status" aria-label="Harness toast">{toast.title}: {toast.description}</div>}
    {component}
  </main></QueryClientProvider>;
}
createRoot(document.getElementById("root")!).render(<App />);
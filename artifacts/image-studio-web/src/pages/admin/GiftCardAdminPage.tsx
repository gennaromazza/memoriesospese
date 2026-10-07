import { useEffect } from 'react';
import { useLocation } from 'wouter';

/**
 * Vecchio indirizzo delle gift card: la gestione ora è una scheda della dashboard,
 * così il menu admin resta sempre visibile.
 */
export default function GiftCardAdminPage() {
  const [, navigate] = useLocation();
  useEffect(() => {
    try {
      sessionStorage.setItem('activeTab', 'gift-card');
    } catch {
      // senza sessionStorage si apre la scheda predefinita della dashboard
    }
    navigate('/admin/dashboard', { replace: true });
  }, [navigate]);
  return <p className="p-6 text-sm text-muted-foreground" role="status">Apro le gift card…</p>;
}

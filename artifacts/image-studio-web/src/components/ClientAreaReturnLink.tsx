import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { createUrl } from '@/lib/config';
import { shouldOfferClientAreaReturn } from '@/lib/client-area-return';

/** Etichetta fissa "La mia area" sulle pagine aperte dall'area cliente. */
export default function ClientAreaReturnLink() {
  const [location] = useLocation();
  if (!shouldOfferClientAreaReturn(location)) return null;
  return (
    <a
      href={createUrl('/area-cliente')}
      className="fixed z-[60] inline-flex items-center gap-1.5 rounded-full bg-[#6b7f6b] px-4 py-2 text-sm font-medium text-white shadow-lg ring-1 ring-black/5 transition hover:bg-[#5a6e5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{
        left: 'max(16px, env(safe-area-inset-left, 0px))',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <ArrowLeft className="h-4 w-4" />
      La mia area
    </a>
  );
}

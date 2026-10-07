import { Mail, MessageCircle, Phone } from 'lucide-react';
import { useStudio } from '@/context/StudioContext';
import { printShopWhatsAppUrl, validWhatsAppDigits } from './whatsapp-help';
import { Link } from 'wouter';

/** Ordinary external link: never opens or sends automatically, never touches page state. */
export function WhatsAppHelp({ orderNumber, className = '' }: { orderNumber?: string | null; className?: string }) {
  const { studioSettings } = useStudio();
  const url = printShopWhatsAppUrl(studioSettings, orderNumber);
  const phone = validWhatsAppDigits(studioSettings.phone);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studioSettings.email || '') ? studioSettings.email.trim() : '';
  const linkClass = 'inline-flex items-center gap-1.5 font-semibold text-terracotta underline underline-offset-2';
  return (
    <div className={`text-sm text-blue-gray/70 ${className}`} data-testid="print-shop-help">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass} data-testid="link-whatsapp-help">
          <MessageCircle className="h-4 w-4" aria-hidden="true" /> Assistenza WhatsApp
        </a>
      ) : (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>WhatsApp non disponibile. Contatta lo studio:</span>
          {phone && <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={linkClass}><Phone className="h-4 w-4" aria-hidden="true" /> {phone}</a>}
          {email && <a href={`mailto:${email}`} className={linkClass}><Mail className="h-4 w-4" aria-hidden="true" /> {email}</a>}
          {!phone && !email && <><span>Recapiti non disponibili al momento.</span><Link href="/" className={linkClass}>Sito dello studio</Link></>}
        </p>
      )}
      {url && <p className="mt-1 text-xs">Non puoi usare WhatsApp?{' '}
        {phone && <a href={`tel:+${phone}`} className={linkClass}><Phone className="h-3 w-3" aria-hidden="true" />Chiama lo studio</a>}
        {email && <> {' '}<a href={`mailto:${email}`} className={linkClass}><Mail className="h-3 w-3" aria-hidden="true" />Email</a></>}
        {!phone && !email && <Link href="/" className={linkClass}>Sito dello studio</Link>}
      </p>}
    </div>
  );
}

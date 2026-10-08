import type { ReactNode } from 'react';
import Navigation from '@/components/Navigation';
import Footer from '@/components/Footer';

/** Contenitore comune delle pagine d'ordine dello shop: menu, titolo e piè di pagina del sito. */
export function ShopShell({
  eyebrow = 'Shop di Natale',
  title,
  subtitle,
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-off-white text-blue-gray">
      <Navigation />
      <main className="pb-20 pt-24 sm:pt-28">
        <header className="border-b border-sage/15 bg-white px-4 py-10">
          <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">{eyebrow}</p>
              <h1 className="mt-2 text-3xl font-semibold sm:text-5xl">{title}</h1>
              {subtitle ? <p className="mt-3 text-blue-gray/60">{subtitle}</p> : null}
            </div>
            {actions}
          </div>
        </header>
        <div className="mx-auto max-w-5xl px-4 py-10">{children}</div>
      </main>
      <Footer />
    </div>
  );
}

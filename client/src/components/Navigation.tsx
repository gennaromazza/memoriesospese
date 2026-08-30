import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useStudio } from "../context/StudioContext";
import { ChevronDown, Menu, X } from "lucide-react";
import { createUrl } from "@/lib/basePath";
import { useLogout } from "../hooks/useLogout";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { getDiscoverGroups, getHeaderItems, getMobileItems } from "@/config/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface NavigationProps {
  isAdminNav?: boolean;
  galleryOwner?: string;
  galleryCode?: string;
}

export default function Navigation({ isAdminNav = false, galleryOwner, galleryCode }: NavigationProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);
  const [, navigate] = useLocation();
  const { studioSettings } = useStudio();
  const { handleLogout } = useLogout();
  const isAdmin = useIsAdmin();

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  // Admin navigation bar
  if (isAdminNav) {
    return (
      <nav className="bg-blue-gray">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <h1 className="text-off-white font-playfair font-semibold text-2xl">Admin Dashboard</h1>
              </div>
              <div className="ml-6 flex items-center space-x-4">
                <a
                  href={createUrl("/")}
                  className="text-white text-sm hover:text-sage"
                >
                  Vai al sito
                </a>
              </div>
            </div>
            <div className="flex items-center">
              <button
                onClick={handleLogout}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-gray bg-opacity-20 hover:bg-opacity-30"
              >
                Esci
              </button>
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Gallery navigation bar (when viewing a specific gallery)
  // Public-facing: nessun avatar/profilo/logout visibile. Solo gli admin
  // hanno una scorciatoia discreta verso il pannello.
  if (galleryOwner) {
    return (
      <nav className="bg-white/90 backdrop-blur-lg shadow-sm mobile-gallery-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex-shrink-0 flex items-center">
              <Link href={createUrl("/")} className="flex items-center">
                {studioSettings.logo ? (
                  <img
                    src={studioSettings.logo}
                    alt={`${studioSettings.name} Logo`}
                    className="h-10 w-auto"
                  />
                ) : (
                  <span className="text-blue-gray font-playfair font-semibold text-xl cursor-pointer">
                    {studioSettings.name || "Image Studio Fotografico"}
                  </span>
                )}
              </Link>
            </div>
            <div className="ml-4 flex items-center md:ml-6 gap-3">
              <span className="hidden sm:inline-block px-3 py-1.5 rounded-full text-blue-gray bg-sage/10 text-sm font-medium">
                Galleria di <span>{galleryOwner}</span>
              </span>

              {/* Pulsante Richiedi Password - solo per non-admin */}
              {galleryCode && !isAdmin && (
                <Button
                  onClick={() => navigate(createUrl(`/request-password/${galleryCode}`))}
                  className="bg-terracotta hover:bg-terracotta/90 text-white rounded-full"
                  size="sm"
                >
                  <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span className="hidden sm:inline">Richiedi Password</span>
                </Button>
              )}

              {/* Scorciatoia admin discreta (visibile solo all'admin loggato) */}
              {isAdmin && (
                <Link
                  to={createUrl('/admin/dashboard')}
                  className="text-xs text-blue-gray/60 hover:text-sage transition-colors"
                  data-testid="link-admin-gallery"
                >
                  Pannello
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>
    );
  }

  // Default public navigation bar (homepage e tutte le pagine pubbliche)
  const headerItems = getHeaderItems();
  const mobileItems = getMobileItems();
  const discoverGroups = getDiscoverGroups();

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/85 backdrop-blur-xl border-b border-sage/10 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0 flex items-center">
            <Link to={createUrl("/")} className="flex items-center group">
              {studioSettings.logo ? (
                <img
                  src={studioSettings.logo}
                  alt={`${studioSettings.name} Logo`}
                  className="h-9 w-auto transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="text-blue-gray font-playfair font-semibold text-xl tracking-wide cursor-pointer transition-colors duration-300 group-hover:text-sage">
                  iMaGe <span className="text-sage">Studio</span>
                </span>
              )}
            </Link>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex md:items-center md:gap-1">
            {headerItems.filter(i => !i.highlight).map((item) => (
              <Link
                key={item.href}
                to={createUrl(item.href)}
                className="relative text-[15px] font-medium text-blue-gray/85 hover:text-sage px-3.5 py-2 rounded-full transition-colors duration-200"
              >
                {item.label}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="group inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[15px] font-medium text-blue-gray/85 outline-none transition-colors duration-200 hover:text-sage focus-visible:ring-2 focus-visible:ring-sage/40 data-[state=open]:bg-sage/10 data-[state=open]:text-dark-sage"
                  aria-label="Apri il menu Scopri"
                >
                  Scopri
                  <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                sideOffset={12}
                className="w-[min(720px,calc(100vw-2rem))] rounded-3xl border-sage/15 bg-white/95 p-4 shadow-2xl backdrop-blur-xl"
              >
                <div className="grid gap-3 md:grid-cols-3">
                  {discoverGroups.map((group) => (
                    <div key={group.label} className="rounded-2xl bg-off-white/70 p-2">
                      <p className="px-3 pb-2 pt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-terracotta">
                        {group.label}
                      </p>
                      <div className="space-y-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <DropdownMenuItem key={item.href} asChild className="cursor-pointer rounded-xl p-0 focus:bg-sage/10">
                              <Link
                                to={createUrl(item.href)}
                                className="flex items-start gap-3 rounded-xl px-3 py-3 text-left outline-none"
                              >
                                {Icon && (
                                  <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-xl bg-white text-dark-sage shadow-sm">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                )}
                                <span>
                                  <span className="block text-sm font-semibold text-blue-gray">{item.label}</span>
                                  <span className="mt-1 block text-xs leading-relaxed text-blue-gray/55">{item.description}</span>
                                </span>
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            {headerItems.filter(i => i.highlight).map((item) => (
              <Link
                key={item.href}
                to={createUrl(item.href)}
                className="ml-3 inline-flex items-center text-[14px] font-medium text-white bg-sage hover:bg-dark-sage px-5 py-2 rounded-full shadow-sm hover:shadow transition-all duration-200"
                data-testid="cta-prenota-chiamata"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Mobile burger */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-blue-gray p-2 -mr-2"
              aria-label={isMenuOpen ? 'Chiudi menu' : 'Apri menu'}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={`${isMenuOpen ? 'block' : 'hidden'} md:hidden bg-white/95 backdrop-blur-xl border-t border-sage/10 shadow-lg fixed left-0 right-0 top-16 max-h-[calc(100vh-4rem)] overflow-y-auto overscroll-contain`}>
        <div className="px-4 pt-4 pb-6 space-y-1">
          {mobileItems.filter(i => !i.highlight).map((item) => (
            <Link
              key={item.href}
              to={createUrl(item.href)}
              onClick={() => setIsMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-base font-medium text-blue-gray rounded-xl hover:text-sage hover:bg-sage/5 transition-colors duration-200"
            >
              {item.icon && <item.icon className="h-5 w-5 text-sage/70" />}
              {item.label}
            </Link>
          ))}
          <Collapsible open={isDiscoverOpen} onOpenChange={setIsDiscoverOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-left text-base font-medium text-blue-gray transition-colors duration-200 hover:bg-sage/5 hover:text-sage"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sage/15 text-xs font-semibold text-dark-sage">+</span>
                  Scopri tutti i servizi
                </span>
                <ChevronDown className={`h-5 w-5 text-sage transition-transform duration-200 ${isDiscoverOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 pb-2">
              <div className="mt-1 space-y-3 rounded-2xl bg-off-white/80 p-3">
                {discoverGroups.map((group) => (
                  <div key={group.label}>
                    <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-terracotta">{group.label}</p>
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          to={createUrl(item.href)}
                          onClick={() => {
                            setIsDiscoverOpen(false);
                            setIsMenuOpen(false);
                          }}
                          className="flex items-start gap-3 rounded-xl px-3 py-2.5 text-blue-gray transition-colors hover:bg-white hover:text-sage"
                        >
                          {Icon && <Icon className="mt-0.5 h-4 w-4 flex-none text-sage" />}
                          <span>
                            <span className="block text-sm font-semibold">{item.label}</span>
                            <span className="mt-0.5 block text-xs leading-relaxed text-blue-gray/50">{item.description}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
          {mobileItems.filter(i => i.highlight).map((item) => (
            <Link
              key={item.href}
              to={createUrl(item.href)}
              onClick={() => setIsMenuOpen(false)}
              className="mt-3 flex items-center justify-center gap-2 px-4 py-3 text-base font-medium text-white bg-sage hover:bg-dark-sage rounded-full shadow-sm transition-all duration-200"
              data-testid="cta-prenota-chiamata-mobile"
            >
              {item.icon && <item.icon className="h-5 w-5" />}
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

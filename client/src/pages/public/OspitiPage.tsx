import { Link } from "wouter";
import {
  Phone,
  Mail,
  MapPin,
  Instagram,
  Facebook,
  Twitter,
  MessageCircle,
  Camera,
  ArrowRight,
} from "lucide-react";
import { useStudio } from "@/context/StudioContext";
import GallerySearch from "@/components/GallerySearch";
import StudioLogo from "@/components/StudioLogo";
import { getWhatsAppLink } from "@shared/phone-utils";
import { useSEO } from "@/hooks/useSEO";

type SocialPlatform = "instagram" | "facebook" | "twitter";

const SOCIAL_BASE: Record<SocialPlatform, string> = {
  instagram: "https://instagram.com/",
  facebook: "https://facebook.com/",
  twitter: "https://x.com/",
};

/**
 * Le impostazioni studio salvano i social come username (es. "@studio") ma per
 * retrocompatibilità il valore potrebbe già essere un URL completo. Normalizziamo
 * in un URL valido, restituendo "" se non c'è nulla da mostrare.
 */
function normalizeSocialUrl(
  value: string | undefined,
  platform: SocialPlatform,
): string {
  const v = value?.trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "").trim();
  if (!handle) return "";
  return SOCIAL_BASE[platform] + handle;
}

export default function OspitiPage() {
  const { studioSettings } = useStudio();

  useSEO({
    title: `${studioSettings.name || "Image Studio"} | Benvenuti`,
    description:
      "Trova la galleria fotografica del tuo evento e scopri i contatti del nostro studio.",
    canonical: "/ospiti",
    noindex: true,
  });

  const address = studioSettings.address?.trim();
  const phone = studioSettings.phone?.trim();
  const whatsapp = studioSettings.whatsapp?.trim();
  const email = studioSettings.email?.trim();
  const instagram = normalizeSocialUrl(
    studioSettings.socialLinks?.instagram,
    "instagram",
  );
  const facebook = normalizeSocialUrl(
    studioSettings.socialLinks?.facebook,
    "facebook",
  );
  const twitter = normalizeSocialUrl(
    studioSettings.socialLinks?.twitter,
    "twitter",
  );

  const mapsUrl = address
    ? `https://maps.google.com/?q=${encodeURIComponent(address)}`
    : null;
  const whatsappUrl = whatsapp ? getWhatsAppLink(whatsapp) : "";

  const hasSocial = Boolean(instagram || facebook || twitter);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#F5EFE6]">
      <div className="mx-auto w-full max-w-md px-5 pb-16 pt-10">
        {/* ── Intestazione studio ── */}
        <header className="text-center">
          <div className="flex justify-center">
            <StudioLogo
              showLink={false}
              imgClassName="h-20 w-auto mx-auto"
              textClassName="text-3xl font-playfair text-blue-gray"
              className="flex justify-center"
            />
          </div>
          {studioSettings.slogan && (
            <p className="mt-3 text-base italic text-gray-500">
              {studioSettings.slogan}
            </p>
          )}

          <div className="mx-auto mt-5 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-gradient-to-r from-transparent to-sage/50" />
            <span className="h-2 w-2 rounded-full bg-sage/40" />
            <span className="h-px w-12 bg-gradient-to-l from-transparent to-sage/50" />
          </div>
        </header>

        {/* ── Trova la galleria ── */}
        <section className="mt-8">
          <div className="rounded-3xl border border-sage/15 bg-white p-6 shadow-xl">
            <div className="text-center">
              <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sage to-sage/80 shadow-md">
                <Camera className="h-7 w-7 text-white" />
              </div>
              <h1 className="font-playfair text-2xl text-blue-gray">
                Trova la galleria del tuo evento
              </h1>
              <p className="mt-2 text-sm text-gray-500">
                Cerca per nome evento o sposi e accedi alle foto.
              </p>
            </div>

            <div className="mt-5 rounded-2xl bg-off-white p-4 shadow-inner">
              <GallerySearch />
            </div>

            <p className="mt-4 text-center text-xs text-gray-400">
              Una volta trovata la galleria, inserisci la password ricevuta via
              email.
            </p>
          </div>
        </section>

        {/* ── Contatti ── */}
        {(phone || whatsapp || email || mapsUrl) && (
          <section className="mt-6">
            <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
              Contatti
            </h2>
            <div className="space-y-3">
              {phone && (
                <a
                  href={`tel:${phone}`}
                  data-testid="link-ospiti-phone"
                  className="flex items-center gap-4 rounded-2xl border border-sage/15 bg-white px-5 py-4 shadow-sm transition active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage/15 text-dark-sage">
                    <Phone className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-gray-400">Chiamaci</span>
                    <span className="block truncate font-medium text-blue-gray">
                      {phone}
                    </span>
                  </span>
                </a>
              )}

              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-ospiti-whatsapp"
                  className="flex items-center gap-4 rounded-2xl border border-sage/15 bg-white px-5 py-4 shadow-sm transition active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25D366]/15 text-[#1da851]">
                    <MessageCircle className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-gray-400">WhatsApp</span>
                    <span className="block truncate font-medium text-blue-gray">
                      Scrivici un messaggio
                    </span>
                  </span>
                </a>
              )}

              {email && (
                <a
                  href={`mailto:${email}`}
                  data-testid="link-ospiti-email"
                  className="flex items-center gap-4 rounded-2xl border border-sage/15 bg-white px-5 py-4 shadow-sm transition active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-terracotta/15 text-terracotta">
                    <Mail className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-gray-400">Email</span>
                    <span className="block truncate font-medium text-blue-gray">
                      {email}
                    </span>
                  </span>
                </a>
              )}

              {mapsUrl && (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="link-ospiti-address"
                  className="flex items-center gap-4 rounded-2xl border border-sage/15 bg-white px-5 py-4 shadow-sm transition active:scale-[0.98]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-gray/10 text-blue-gray">
                    <MapPin className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-gray-400">
                      Dove siamo
                    </span>
                    <span className="block truncate font-medium text-blue-gray">
                      {address}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-gray-300" />
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── Social ── */}
        {hasSocial && (
          <section className="mt-6">
            <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
              Seguici
            </h2>
            <div className="flex items-center justify-center gap-4">
              {instagram && (
                <a
                  href={instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  data-testid="link-ospiti-instagram"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-gray shadow-sm transition active:scale-95 hover:text-terracotta"
                >
                  <Instagram className="h-6 w-6" />
                </a>
              )}
              {facebook && (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  data-testid="link-ospiti-facebook"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-gray shadow-sm transition active:scale-95 hover:text-terracotta"
                >
                  <Facebook className="h-6 w-6" />
                </a>
              )}
              {twitter && (
                <a
                  href={twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Twitter"
                  data-testid="link-ospiti-twitter"
                  className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-blue-gray shadow-sm transition active:scale-95 hover:text-terracotta"
                >
                  <Twitter className="h-6 w-6" />
                </a>
              )}
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <footer className="mt-10 text-center">
          <Link
            href="/"
            className="text-sm font-medium text-sage hover:text-dark-sage"
          >
            Visita il nostro sito
          </Link>
          <p className="mt-4 text-xs text-gray-400">
            © {new Date().getFullYear()}{" "}
            {studioSettings.name || "Image Studio"}. Tutti i diritti riservati.
          </p>
        </footer>
      </div>
    </div>
  );
}

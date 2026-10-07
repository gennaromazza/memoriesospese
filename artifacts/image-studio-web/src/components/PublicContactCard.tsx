import { Mail, MapPin, Phone } from "lucide-react";

interface PublicContactCardProps {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export default function PublicContactCard({
  address,
  phone,
  email,
}: PublicContactCardProps) {
  const publicAddress = address?.trim() || "";
  const publicPhone = phone?.trim() || "";
  const publicEmail = email?.trim() || "";

  if (!publicAddress && !publicPhone && !publicEmail) return null;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-sage/10">
      <h3 className="text-2xl font-playfair text-blue-gray mb-6">
        Informazioni di Contatto
      </h3>
      <div className="space-y-4">
        {publicAddress && (
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-sage/10 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-5 w-5 text-sage" />
            </div>
            <div>
              <p className="font-semibold text-blue-gray mb-1">Indirizzo</p>
              <p className="text-gray-600">{publicAddress}</p>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(publicAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sage hover:text-dark-sage text-sm font-medium mt-2 inline-flex items-center gap-1"
              >
                Apri in Google Maps
                <span className="text-xs">→</span>
              </a>
            </div>
          </div>
        )}
        {publicPhone && (
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-sage/10 flex items-center justify-center flex-shrink-0">
              <Phone className="h-5 w-5 text-sage" />
            </div>
            <div>
              <p className="font-semibold text-blue-gray mb-1">Telefono</p>
              <a
                href={`tel:${publicPhone}`}
                className="text-gray-600 hover:text-sage transition"
              >
                {publicPhone}
              </a>
            </div>
          </div>
        )}
        {publicEmail && (
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-sage/10 flex items-center justify-center flex-shrink-0">
              <Mail className="h-5 w-5 text-sage" />
            </div>
            <div>
              <p className="font-semibold text-blue-gray mb-1">Email</p>
              <a
                href={`mailto:${publicEmail}`}
                className="text-gray-600 hover:text-sage transition break-all"
              >
                {publicEmail}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
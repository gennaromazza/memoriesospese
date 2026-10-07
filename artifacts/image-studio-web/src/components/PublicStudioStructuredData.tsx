interface PublicStudioStructuredDataProps {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  logo?: string | null;
  openingTime?: string | null;
  closingTime?: string | null;
}

const STUDIO_BUSINESS_ID = "https://imagestudiofotografico.com/#business";
const STUDIO_URL = "https://imagestudiofotografico.com";
const STUDIO_IMAGE = `${STUDIO_URL}/1200x630px.jpg`;

export function buildPublicStudioSchema({
  name,
  address,
  phone,
  email,
  websiteUrl,
  logo,
  openingTime,
  closingTime,
}: PublicStudioStructuredDataProps) {
  const publicName = name?.trim() || "";
  if (!publicName) return null;

  const publicAddress = address?.trim() || "";
  const publicPhone = phone?.trim() || "";
  const publicEmail = email?.trim() || "";
  const publicWebsiteUrl = websiteUrl?.trim() || STUDIO_URL;
  const publicLogo = logo?.trim() || "";
  const publicOpeningTime = openingTime?.trim() || "";
  const publicClosingTime = closingTime?.trim() || "";
  const validTime = (value: string) =>
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const hasPublicHours =
    validTime(publicOpeningTime) && validTime(publicClosingTime);

  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "ProfessionalService"],
    "@id": STUDIO_BUSINESS_ID,
    name: publicName,
    image: publicLogo || STUDIO_IMAGE,
    description:
      "Fotografo professionista ad Aversa specializzato in matrimoni, battesimi, comunioni e cerimonie. Gennaro Mazzacane - oltre 10 anni di esperienza e 500+ matrimoni documentati in Campania.",
    url: publicWebsiteUrl,
    ...(hasPublicHours
      ? {
          openingHoursSpecification: {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ],
            opens: publicOpeningTime,
            closes: publicClosingTime,
          },
        }
      : {}),
    ...(publicAddress
      ? {
          address: {
            "@type": "PostalAddress",
            streetAddress: publicAddress,
            addressCountry: "IT",
          },
        }
      : {}),
    ...(publicPhone ? { telephone: publicPhone } : {}),
    ...(publicEmail ? { email: publicEmail } : {}),
  };
}

export default function PublicStudioStructuredData(
  props: PublicStudioStructuredDataProps,
) {
  const schema = buildPublicStudioSchema(props);
  if (!schema) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
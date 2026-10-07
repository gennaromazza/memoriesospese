import { useStudio } from "@/context/StudioContext";
import { Link } from "wouter";
import { createUrl } from "@/lib/basePath";

interface StudioLogoProps {
  className?: string;
  imgClassName?: string;
  textClassName?: string;
  linkTo?: string | null;
  showLink?: boolean;
}

export default function StudioLogo({
  className = "",
  imgClassName = "h-12 w-auto",
  textClassName = "text-2xl font-playfair text-blue-gray",
  linkTo = "/",
  showLink = true,
}: StudioLogoProps) {
  const { studioSettings } = useStudio();

  const logoContent = studioSettings.logo ? (
    <img
      src={studioSettings.logo}
      alt={`${studioSettings.name} Logo`}
      className={imgClassName}
    />
  ) : (
    <span className={textClassName}>
      iMaGe <span className="text-sage">Studio</span>
    </span>
  );

  if (showLink && linkTo) {
    return (
      <Link
        href={createUrl(linkTo)}
        className={`inline-flex items-center ${className}`}
      >
        {logoContent}
      </Link>
    );
  }

  return <div className={className}>{logoContent}</div>;
}

interface StudioQuoteIdentityPreviewProps {
  name: string;
  logo?: string;
}

export default function StudioQuoteIdentityPreview({
  name,
  logo,
}: StudioQuoteIdentityPreviewProps) {
  const studioName = name.trim();

  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-stone-100 px-4 py-3 sm:px-5">
      <div className="flex h-12 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-stone-100 bg-stone-50 p-1.5">
        {logo ? (
          <img
            src={logo}
            alt={`Logo ${studioName || "dello studio"}`}
            data-testid="img-studio-preview-logo"
            className="h-full max-h-9 w-full max-w-24 object-contain"
          />
        ) : (
          <span
            data-testid="placeholder-studio-preview-logo"
            className="text-center text-[10px] leading-tight text-stone-400"
          >
            Logo dello studio
          </span>
        )}
      </div>
      <p
        data-testid="text-studio-preview-name"
        className="min-w-0 max-w-full break-words text-sm font-semibold text-stone-700"
      >
        {studioName || "Nome dello studio"}
      </p>
    </div>
  );
}

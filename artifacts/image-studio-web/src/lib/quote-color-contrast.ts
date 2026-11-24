const MINIMUM_TEXT_CONTRAST = 4.5;
const WHITE = "#ffffff";
const ACCENT_TEXT = "#44403c";
const SECONDARY_BADGE_ALPHA = 0x30 / 0xff;

export interface QuoteColorContrastIssue {
  label: string;
  ratio: number;
}

function parseHexColor(color: string): [number, number, number] | null {
  const match = /^#?([\da-f]{6})$/i.exec(color);
  if (!match) return null;

  const value = match[1];
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function linearize(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: [number, number, number]): number {
  const [red, green, blue] = color.map(linearize);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getContrastRatio(foreground: string, background: string): number | null {
  const foregroundRgb = parseHexColor(foreground);
  const backgroundRgb = parseHexColor(background);
  if (!foregroundRgb || !backgroundRgb) return null;

  const luminances = [
    relativeLuminance(foregroundRgb),
    relativeLuminance(backgroundRgb),
  ].sort((a, b) => b - a);

  return (luminances[0] + 0.05) / (luminances[1] + 0.05);
}

function compositeOverWhite(color: string, alpha: number): string | null {
  const rgb = parseHexColor(color);
  if (!rgb) return null;

  const composited = rgb.map(channel =>
    Math.round(channel * alpha + 255 * (1 - alpha)),
  );
  return `#${composited.map(channel => channel.toString(16).padStart(2, "0")).join("")}`;
}

function addIssueIfLowContrast(
  issues: QuoteColorContrastIssue[],
  label: string,
  foreground: string,
  background: string,
): void {
  const ratio = getContrastRatio(foreground, background);
  if (ratio !== null && ratio < MINIMUM_TEXT_CONTRAST) {
    issues.push({ label, ratio });
  }
}

export function getQuoteColorContrastIssues(
  primaryColor: string,
  secondaryColor: string,
): QuoteColorContrastIssue[] {
  const issues: QuoteColorContrastIssue[] = [];
  const secondaryBadgeBackground = compositeOverWhite(secondaryColor, SECONDARY_BADGE_ALPHA);

  addIssueIfLowContrast(issues, "Testo bianco sul pulsante principale", WHITE, primaryColor);
  addIssueIfLowContrast(issues, "Accento principale su fondo chiaro", primaryColor, WHITE);
  if (secondaryBadgeBackground) {
    addIssueIfLowContrast(
      issues,
      "Testo sull’accento secondario",
      ACCENT_TEXT,
      secondaryBadgeBackground,
    );
  }

  return issues;
}

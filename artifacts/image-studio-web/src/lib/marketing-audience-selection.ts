/** A specific audience replaces "all"; specific groups are otherwise additive. */
export function toggleMarketingAudienceFilter(current: string[], value: string): string[] {
  if (current.includes(value)) return current.filter((item) => item !== value);
  if (value === "all") return ["all"];
  return [...current.filter((item) => item !== "all"), value];
}

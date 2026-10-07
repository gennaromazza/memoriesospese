export interface SlideshowPositionedItem {
  id: string;
  position?: number;
  active?: boolean;
}

export function filterActiveSlideshowImages<T extends SlideshowPositionedItem>(items: T[]): T[] {
  return items.filter((item) => item.active !== false);
}

export function normalizeSlideshowPositions<T extends SlideshowPositionedItem>(items: T[]): Array<T & { position: number }> {
  return [...items]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.id.localeCompare(b.id))
    .map((item, position) => ({ ...item, position }));
}

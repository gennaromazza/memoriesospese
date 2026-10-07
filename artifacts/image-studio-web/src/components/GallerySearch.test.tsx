import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GallerySearch from "./GallerySearch";

// Inspect the actual component's link props and click handlers without mounting
// or connecting to Firebase. These tests cover routing, not loading from Firestore.
const fixture = vi.hoisted(() => ({
  states: [] as unknown[],
  stateIndex: 0,
  navigate: vi.fn(),
}));

vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => [fixture.states[fixture.stateIndex++], vi.fn()],
    useEffect: vi.fn(),
    useMemo: (factory: () => unknown) => factory(),
  };
});
vi.mock("wouter", () => ({ useLocation: () => ["/accesso-galleria", fixture.navigate] }));
vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(), getDocs: vi.fn(), query: vi.fn(), orderBy: vi.fn(),
  limit: vi.fn(), Timestamp: class {},
}));
vi.mock("./ui/card", () => ({ Card: "section", CardContent: "div" }));
vi.mock("./ui/input", () => ({ Input: "input" }));

function collectLinks(node: React.ReactNode): React.ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(collectLinks);
  if (!React.isValidElement<Record<string, any>>(node)) return [];
  return [
    ...(node.type === "a" ? [node] : []),
    ...collectLinks(node.props.children),
  ];
}

describe("GallerySearch public navigation", () => {
  beforeEach(() => {
    fixture.stateIndex = 0;
    fixture.navigate.mockClear();
  });

  for (const section of ["today", "past", "search"] as const) {
    it.each(["", null, undefined, "QR-AbC"])(
      `${section}: href and click use the same identifier when code is %s`,
      code => {
        const createdAt = new Date();
        if (section === "past") createdAt.setDate(createdAt.getDate() - 1);
        const gallery = { id: "windows-fixture-id", name: "Fixture Event", code,
          date: "2026-10-02", createdAt };
        fixture.states = [
          section === "search" ? "Fixture" : "",
          section === "search" ? [gallery] : [],
          [gallery],
          false,
        ];
        const links = collectLinks(GallerySearch());
        expect(links).toHaveLength(1);
        const expected = `/gallery/${code || gallery.id}`;
        expect(links[0].props.href).toBe(expected);
        const preventDefault = vi.fn();
        links[0].props.onClick({ preventDefault });
        expect(preventDefault).toHaveBeenCalledOnce();
        expect(fixture.navigate).toHaveBeenCalledExactlyOnceWith(expected);
      },
    );
  }
});
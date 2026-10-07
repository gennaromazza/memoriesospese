import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { getGalleryPageState } from "./gallery-page-state";

describe("gallery page loading state", () => {
  const settled = {
    lookupStatus: "success" as const,
    fetchStatus: "idle" as const,
    hasGallery: false,
    isLoadingPhotos: false,
  };

  it.each(["fetching", "paused", "idle"] as const)(
    "never reports not-found for a pending lookup (%s)",
    fetchStatus => {
      expect(getGalleryPageState({ ...settled, lookupStatus: "pending", fetchStatus }))
        .toBe("loading");
    },
  );
  it.each(["fetching", "paused"] as const)(
    "waits for revalidation of cached absence (%s)",
    fetchStatus => expect(getGalleryPageState({ ...settled, fetchStatus })).toBe("loading"),
  );
  it("reports not-found only after a completed empty lookup", () => {
    expect(getGalleryPageState(settled)).toBe("not-found");
  });
  it("distinguishes a failed lookup from a nonexistent gallery", () => {
    expect(getGalleryPageState({ ...settled, lookupStatus: "error" })).toBe("error");
  });
  it("waits for initial photos after the gallery is found", () => {
    expect(getGalleryPageState({ ...settled, hasGallery: true, isLoadingPhotos: true }))
      .toBe("loading");
  });
  it("does not hide an existing gallery during a background refresh", () => {
    expect(getGalleryPageState({ ...settled, hasGallery: true, fetchStatus: "fetching" }))
      .toBe("ready");
  });

  it.each([true, false])(
    "handles a delayed real query with the photos query disabled (found=%s)",
    async found => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      let resolve!: (value: { id: string } | null) => void;
      const response = new Promise<{ id: string } | null>(done => { resolve = done; });
      const gallery = new QueryObserver(client, {
        queryKey: ["gallery", "fixture"], queryFn: () => response,
      });
      const photos = new QueryObserver(client, {
        queryKey: ["photos", "fixture"], queryFn: async () => [], enabled: false,
      });
      const unsubscribe = gallery.subscribe(() => {});
      const state = () => {
        const lookup = gallery.getCurrentResult();
        return getGalleryPageState({
          lookupStatus: lookup.status, fetchStatus: lookup.fetchStatus,
          hasGallery: !!lookup.data, isLoadingPhotos: photos.getCurrentResult().isLoading,
        });
      };
      try {
        expect(photos.getCurrentResult().isLoading).toBe(false);
        expect(state()).toBe("loading");
        resolve(found ? { id: "fixture" } : null);
        await vi.waitFor(() => expect(state()).toBe(found ? "ready" : "not-found"));
      } finally {
        unsubscribe();
        client.clear();
      }
    },
  );
});
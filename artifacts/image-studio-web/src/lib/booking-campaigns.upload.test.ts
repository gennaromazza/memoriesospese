import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const firebaseMock = vi.hoisted(() => ({
  currentUser: null as null | { getIdToken: () => Promise<string> },
  getIdToken: vi.fn(async () => "admin-token"),
}));

vi.mock("@/lib/firebase", () => ({
  db: {},
  auth: {
    get currentUser() {
      return firebaseMock.currentUser;
    },
  },
}));

import { uploadCampaignImage } from "./booking-campaigns";

describe("uploadCampaignImage", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    firebaseMock.getIdToken.mockClear().mockResolvedValue("admin-token");
    firebaseMock.currentUser = { getIdToken: firebaseMock.getIdToken };
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda l’immagine compressa all’API admin con il token Firebase e restituisce l’URL", async () => {
    const file = new File(["image bytes"], "cover.jpg", { type: "image/jpeg" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      downloadUrl: "https://firebasestorage.googleapis.com/v0/b/test/o/campaigns%2Fcampaign-1%2Fslider.jpg?alt=media&token=x",
      storagePath: "campaigns/campaign-1/slider.jpg",
    }), { status: 201 }));

    const result = await uploadCampaignImage("campaign-1", "slider", file);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/campaigns/campaign-1/images/slider",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer admin-token",
          "Content-Type": "image/jpeg",
        },
        body: file,
      }),
    );
    expect(result.downloadUrl).toContain("firebasestorage.googleapis.com");
    expect(result.storagePath).toBe("campaigns/campaign-1/slider.jpg");
  });

  it("non carica senza una sessione Firebase e conserva l’errore API", async () => {
    const file = new File(["image bytes"], "cover.png", { type: "image/png" });
    firebaseMock.currentUser = null;
    await expect(uploadCampaignImage("campaign-1", "booking", file))
      .rejects.toThrow("Sessione amministratore non disponibile");
    expect(fetchMock).not.toHaveBeenCalled();

    firebaseMock.currentUser = { getIdToken: firebaseMock.getIdToken };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Accesso negato: solo admin" }), { status: 403 }));
    await expect(uploadCampaignImage("campaign-1", "booking", file))
      .rejects.toThrow("Accesso negato: solo admin");

    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: { code: "unauthenticated", message: "Verifica passkey richiesta" },
    }), { status: 401 }));
    await expect(uploadCampaignImage("campaign-1", "booking", file))
      .rejects.toThrow("Verifica passkey richiesta");
  });
});

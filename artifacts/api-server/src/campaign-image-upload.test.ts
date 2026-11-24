import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  MAX_CAMPAIGN_IMAGE_BYTES,
  storeCampaignImage,
} from "./campaign-image-upload.js";

async function samplePng() {
  return sharp({
    create: { width: 4, height: 3, channels: 3, background: { r: 120, g: 140, b: 160 } },
  }).png().toBuffer();
}

function mockBucket() {
  const paths: string[] = [];
  const save = vi.fn(async (_data: Buffer, _options: unknown) => undefined);
  const file = (path: string) => {
    paths.push(path);
    return { save };
  };
  return { bucket: { name: "studio-test.firebasestorage.app", file }, paths, save };
}

describe("storeCampaignImage", () => {
  it("salva la copertina in un percorso per campagna con URL Firebase tokenizzato", async () => {
    const image = await samplePng();
    const mock = mockBucket();
    const createId = vi.fn().mockReturnValueOnce("object-id").mockReturnValueOnce("download-token");

    const result = await storeCampaignImage(
      { campaignId: "campaign-123", imageKind: "slider", contentType: "image/png", image },
      mock.bucket,
      createId,
    );

    expect(mock.paths).toHaveLength(1);
    expect(mock.paths[0]).toMatch(/^campaigns\/campaign-123\/slider_\d+_object-id\.png$/);
    expect(mock.save).toHaveBeenCalledWith(image, expect.objectContaining({
      resumable: false,
      metadata: expect.objectContaining({
        contentType: "image/png",
        metadata: { firebaseStorageDownloadTokens: "download-token" },
      }),
    }));
    expect(result.storagePath).toBe(mock.paths[0]);
    expect(result.downloadUrl).toContain("studio-test.firebasestorage.app");
    expect(result.downloadUrl).toContain(encodeURIComponent(result.storagePath));
    expect(result.downloadUrl).toContain("token=download-token");
  });

  it("consente il caricamento temporaneo per una nuova campagna", async () => {
    const mock = mockBucket();
    const result = await storeCampaignImage(
      { campaignId: "temp", imageKind: "booking", contentType: "image/png", image: await samplePng() },
      mock.bucket,
      () => "test-id",
    );

    expect(result.storagePath).toMatch(/^campaigns\/temp\/booking_/);
  });

  it("rifiuta ID non sicuri, MIME discordanti e file oltre il limite", async () => {
    const mock = mockBucket();
    const image = await samplePng();

    await expect(storeCampaignImage(
      { campaignId: "../other", imageKind: "slider", contentType: "image/png", image },
      mock.bucket,
    )).rejects.toMatchObject({ status: 400 });

    await expect(storeCampaignImage(
      { campaignId: "campaign-123", imageKind: "slider", contentType: "image/jpeg", image },
      mock.bucket,
    )).rejects.toMatchObject({ status: 415 });

    await expect(storeCampaignImage(
      { campaignId: "campaign-123", imageKind: "slider", contentType: "image/png", image: Buffer.alloc(MAX_CAMPAIGN_IMAGE_BYTES + 1) },
      mock.bucket,
    )).rejects.toMatchObject({ status: 413 });

    expect(mock.save).not.toHaveBeenCalled();
  });
});

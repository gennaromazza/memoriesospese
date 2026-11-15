import { randomUUID } from "node:crypto";
import sharp from "sharp";

export const MAX_CAMPAIGN_IMAGE_BYTES = 5 * 1024 * 1024;

export type CampaignImageKind = "slider" | "booking";

export class CampaignImageUploadError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CampaignImageUploadError";
  }
}

type CampaignImageBucket = {
  name: string;
  file: (path: string) => {
    save: (
      data: Buffer,
      options: {
        resumable: false;
        metadata: {
          contentType: string;
          cacheControl: string;
          metadata: { firebaseStorageDownloadTokens: string };
        };
      },
    ) => Promise<unknown>;
  };
};

const imageFormats = {
  jpeg: { extension: "jpg", contentType: "image/jpeg" },
  png: { extension: "png", contentType: "image/png" },
  webp: { extension: "webp", contentType: "image/webp" },
} as const;

export async function storeCampaignImage(
  input: {
    campaignId: string;
    imageKind: CampaignImageKind;
    contentType: string;
    image: Buffer;
  },
  bucket: CampaignImageBucket,
  createId: () => string = randomUUID,
): Promise<{ downloadUrl: string; storagePath: string }> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.campaignId)) {
    throw new CampaignImageUploadError(400, "Identificativo campagna non valido");
  }
  if (input.imageKind !== "slider" && input.imageKind !== "booking") {
    throw new CampaignImageUploadError(400, "Tipo immagine non valido");
  }
  if (!Buffer.isBuffer(input.image) || input.image.length === 0) {
    throw new CampaignImageUploadError(400, "Immagine vuota o non valida");
  }
  if (input.image.length > MAX_CAMPAIGN_IMAGE_BYTES) {
    throw new CampaignImageUploadError(413, "L'immagine non può superare 5 MB");
  }

  const declaredContentType = input.contentType.split(";")[0].trim().toLowerCase();
  if (!Object.values(imageFormats).some(format => format.contentType === declaredContentType)) {
    throw new CampaignImageUploadError(415, "Formato immagine non supportato. Usa JPEG, PNG o WebP.");
  }

  let metadata: { format?: string; width?: number; height?: number };
  try {
    metadata = await sharp(input.image, { limitInputPixels: 20_000_000 }).metadata();
  } catch {
    throw new CampaignImageUploadError(400, "Il file non è un'immagine valida");
  }

  const imageFormat = metadata.format && imageFormats[metadata.format as keyof typeof imageFormats];
  if (!imageFormat || imageFormat.contentType !== declaredContentType) {
    throw new CampaignImageUploadError(415, "Il formato del file non corrisponde al tipo dichiarato");
  }
  if (!metadata.width || !metadata.height) {
    throw new CampaignImageUploadError(400, "Dimensioni immagine non valide");
  }

  const fileId = createId();
  const token = createId();
  const storagePath = `campaigns/${input.campaignId}/${input.imageKind}_${Date.now()}_${fileId}.${imageFormat.extension}`;
  await bucket.file(storagePath).save(input.image, {
    resumable: false,
    metadata: {
      contentType: imageFormat.contentType,
      cacheControl: "public, max-age=31536000, immutable",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const downloadUrl =
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}` +
    `/o/${encodeURIComponent(storagePath)}?alt=media&token=${encodeURIComponent(token)}`;

  return { downloadUrl, storagePath };
}

import type { NextFunction, Request, Response } from "express";
import multer from "multer";

export const TEMPLATE_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const TEMPLATE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const defaultUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: TEMPLATE_IMAGE_MAX_BYTES,
    files: 1,
    fields: 0,
    // Undici/browser multipart encoders can emit one non-file part while
    // framing the file; fields: 0 still rejects any user-supplied fields.
    parts: 2,
    fieldNestingDepth: 0,
  } as NonNullable<multer.Options["limits"]> & { fieldNestingDepth: number },
  fileFilter: (_req, file, cb) => {
    if ((TEMPLATE_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
      return;
    }

    const error = new Error("Formato non supportato: usa JPEG, PNG o WebP");
    (error as Error & { code?: string }).code = "UNSUPPORTED_MIME";
    cb(error);
  },
});

export function mapTemplateImageMulterError(error: any): {
  status: number;
  body: { error: string; code: string };
} {
  if (error instanceof multer.MulterError) {
    const messages: Record<string, string> = {
      LIMIT_FILE_SIZE: "Il file supera la dimensione massima di 5 MiB",
      LIMIT_UNEXPECTED_FILE:
        "Campo file non valido o numero di file non consentito",
      LIMIT_PART_COUNT: "La richiesta contiene troppe parti",
      LIMIT_FIELD_COUNT: "La richiesta contiene troppi campi",
      LIMIT_FIELD_KEY: "Nome campo non valido",
      LIMIT_FIELD_VALUE: "Valore campo non valido",
    };
    return {
      status: error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
      body: {
        error: messages[error.code] || "Richiesta upload non valida",
        code: error.code || "UPLOAD_INVALID",
      },
    };
  }

  if (error?.code === "UNSUPPORTED_MIME") {
    return {
      status: 415,
      body: {
        error: "Formato non supportato: sono consentiti solo JPEG, PNG o WebP",
        code: "UNSUPPORTED_MIME",
      },
    };
  }

  return {
    status: 400,
    body: {
      error: "Richiesta upload non valida",
      code: "UPLOAD_INVALID",
    },
  };
}


export function createTemplateImageUploadMiddleware(
  parser = defaultUpload,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    parser.single("image")(req, res, (error: any) => {
      if (!error) {
        next();
        return;
      }

      const mapped = mapTemplateImageMulterError(error);
      res.status(mapped.status).json(mapped.body);
    });
  };
}

export const uploadTemplateImage = createTemplateImageUploadMiddleware();

export class TemplateImageUploadError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "TemplateImageUploadError";
  }
}

type StorageFile = { delete: () => Promise<unknown> };
type StorageBucket = {
  name: string;
  file: (path: string) => StorageFile;
};

export interface TemplateImageUploadDependencies {
  getTemplateById: (id: string) => Promise<{ imageUrls?: string[] } | null>;
  updateTemplate: (
    id: string,
    data: { imageUrls: string[] },
  ) => Promise<void>;
  getBucket: () => StorageBucket;
  saveWithDownloadToken: (
    bucket: StorageBucket,
    storagePath: string,
    buffer: Buffer,
    contentType: string,
    metadata: Record<string, string>,
  ) => Promise<string>;
  now?: () => number;
  log?: (entry: Record<string, unknown>) => void;
}

export async function saveTemplateImage(
  templateId: string,
  file: {
    originalname: string;
    mimetype: string;
    buffer: Buffer;
  } | undefined,
  dependencies: TemplateImageUploadDependencies,
): Promise<{ imageUrl: string }> {
  let stage = "template";
  let storageFile: StorageFile | null = null;
  let storageUploadSucceeded = false;
  const log =
    dependencies.log ||
    ((entry: Record<string, unknown>) => console.error("[consultation-upload]", entry));

  try {
    const template = await dependencies.getTemplateById(templateId);
    if (!template) {
      throw new TemplateImageUploadError(
        "Template non trovato",
        404,
        "TEMPLATE_NOT_FOUND",
      );
    }

    const currentImages = template.imageUrls || [];
    if (currentImages.length >= 10) {
      throw new TemplateImageUploadError(
        "Massimo 10 immagini per template",
        400,
        "IMAGE_LIMIT_REACHED",
      );
    }
    if (!file) {
      throw new TemplateImageUploadError(
        "Nessun file caricato",
        400,
        "FILE_MISSING",
      );
    }

    stage = "storage";
    const bucket = dependencies.getBucket();
    const timestamp = dependencies.now ? dependencies.now() : Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `consultation-templates/${templateId}/${timestamp}_${safeName}`;
    const imageUrl = await dependencies.saveWithDownloadToken(
      bucket,
      storagePath,
      file.buffer,
      file.mimetype,
      {
        uploadedAt: new Date().toISOString(),
        originalName: file.originalname,
        templateId,
      },
    );
    storageUploadSucceeded = true;
    storageFile = bucket.file(storagePath);

    stage = "firestore-association";
    await dependencies.updateTemplate(templateId, {
      imageUrls: [...currentImages, imageUrl],
    });

    return { imageUrl };
  } catch (error: any) {
    if (error instanceof TemplateImageUploadError && error.status < 500) {
      throw error;
    }

    log({
      code: `UPLOAD_${stage.toUpperCase()}_FAILED`,
      context: { templateId, stage },
      error: error instanceof Error ? error.message : String(error),
    });

    if (storageUploadSucceeded && storageFile) {
      try {
        await storageFile.delete();
      } catch (cleanupError: any) {
        log({
          code: "UPLOAD_CLEANUP_FAILED",
          context: { templateId, stage: "cleanup" },
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }
    }

    throw new TemplateImageUploadError(
      "Errore upload immagine",
      500,
      "UPLOAD_FAILED",
    );
  }
}
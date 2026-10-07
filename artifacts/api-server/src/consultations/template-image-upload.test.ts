import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import {
  TemplateImageUploadError,
  uploadTemplateImage,
  saveTemplateImage,
} from "./template-image-upload";

const IMAGE_URL =
  "https://firebasestorage.googleapis.com/v0/b/test/o/consultation-templates%2Ftemplate-1%2Fimage.png?alt=media&token=stable-token";

type State = {
  template: { imageUrls?: string[] } | null;
  saveError: Error | null;
  updateError: Error | null;
  cleanupError: Error | null;
  saved: number;
  updated: Array<{ id: string; imageUrls: string[] }>;
  deleted: number;
  bucketRequested: number;
  logs: Array<Record<string, unknown>>;
};

function makeState(): State {
  return {
    template: { imageUrls: [] },
    saveError: null,
    updateError: null,
    cleanupError: null,
    saved: 0,
    updated: [],
    deleted: 0,
    bucketRequested: 0,
    logs: [],
  };
}

function makeDependencies(state: State) {
  const file = {
    delete: async () => {
      state.deleted++;
      if (state.cleanupError) throw state.cleanupError;
    },
  };
  const bucket = {
    name: "test",
    file: () => file,
  };

  return {
    getTemplateById: async () => state.template,
    updateTemplate: async (id: string, data: { imageUrls: string[] }) => {
      if (state.updateError) throw state.updateError;
      state.updated.push({ id, imageUrls: data.imageUrls });
    },
    getBucket: () => {
      state.bucketRequested++;
      return bucket;
    },
    saveWithDownloadToken: async () => {
      if (state.saveError) throw state.saveError;
      state.saved++;
      return IMAGE_URL;
    },
    now: () => 1_700_000_000_000,
    log: (entry: Record<string, unknown>) => state.logs.push(entry),
  };
}

async function postUpload(
  form: FormData,
  state: State,
): Promise<{ status: number; body: any }> {
  const app = express();
  app.post("/upload", uploadTemplateImage, async (req, res) => {
    try {
      const result = await saveTemplateImage(
        "template-1",
        (req as any).file,
        makeDependencies(state),
      );
      res.json({ imageUrl: result.imageUrl });
    } catch (error: any) {
      if (error instanceof TemplateImageUploadError) {
        res.status(error.status).json({ error: error.message, code: error.code });
        return;
      }
      res.status(500).json({ error: "Errore inatteso" });
    }
  });

  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/upload`, {
      method: "POST",
      body: form,
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function imageForm(
  field: string,
  mime: string,
  size = 1024,
): FormData {
  const form = new FormData();
  form.append(field, new Blob([Buffer.alloc(size)], { type: mime }), "image.bin");
  return form;
}

describe("template image multipart upload", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(["image/jpeg", "image/png", "image/webp"])(
    "accepts %s and associates the stable URL",
    async (mime) => {
      const state = makeState();
      const result = await postUpload(imageForm("image", mime), state);

      expect(result.status).toBe(200);
      expect(result.body.imageUrl).toBe(IMAGE_URL);
      expect(state.saved).toBe(1);
      expect(state.updated).toEqual([
        { id: "template-1", imageUrls: [IMAGE_URL] },
      ]);
    },
  );

  it("accepts a file exactly at the 5 MiB limit", async () => {
    const state = makeState();
    const result = await postUpload(
      imageForm("image", "image/png", 5 * 1024 * 1024),
      state,
    );

    expect(result.status).toBe(200);
    expect(state.saved).toBe(1);
  });

  it("rejects unsupported MIME with a JSON 415 and code", async () => {
    const result = await postUpload(
      imageForm("image", "image/gif"),
      makeState(),
    );

    expect(result.status).toBe(415);
    expect(result.body).toMatchObject({ code: "UNSUPPORTED_MIME" });
  });

  it("rejects files over 5 MiB with JSON 413 and code", async () => {
    const result = await postUpload(
      imageForm("image", "image/png", 5 * 1024 * 1024 + 1),
      makeState(),
    );

    expect(result.status).toBe(413);
    expect(result.body).toMatchObject({ code: "LIMIT_FILE_SIZE" });
  });

  it("rejects a wrong multipart field and a missing file with useful 400s", async () => {
    const wrongField = await postUpload(
      imageForm("wrong-field", "image/png"),
      makeState(),
    );
    expect(wrongField.status).toBe(400);
    expect(wrongField.body).toMatchObject({ code: "LIMIT_UNEXPECTED_FILE" });

    const missing = await postUpload(new FormData(), makeState());
    expect(missing.status).toBe(400);
    expect(missing.body).toMatchObject({ code: "FILE_MISSING" });
  });

  it("returns 404 for a missing template before requesting Storage", async () => {
    const state = makeState();
    state.template = null;
    const result = await postUpload(
      imageForm("image", "image/png"),
      state,
    );

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
    expect(state.bucketRequested).toBe(0);
    expect(state.saved).toBe(0);
  });

  it("returns 500 for Storage failure without cleaning up", async () => {
    const state = makeState();
    state.saveError = new Error("storage unavailable");
    const result = await postUpload(
      imageForm("image", "image/png"),
      state,
    );

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ code: "UPLOAD_FAILED" });
    expect(state.deleted).toBe(0);
    expect(state.logs).toContainEqual(
      expect.objectContaining({ code: "UPLOAD_STORAGE_FAILED" }),
    );
  });

  it("cleans up after Firestore association failure and preserves 500 on cleanup failure", async () => {
    const state = makeState();
    state.updateError = new Error("firestore unavailable");
    state.cleanupError = new Error("cleanup unavailable");
    const result = await postUpload(
      imageForm("image", "image/png"),
      state,
    );

    expect(result.status).toBe(500);
    expect(result.body).toMatchObject({ code: "UPLOAD_FAILED" });
    expect(state.deleted).toBe(1);
    expect(state.logs).toContainEqual(
      expect.objectContaining({ code: "UPLOAD_FIRESTORE-ASSOCIATION_FAILED" }),
    );
    expect(state.logs).toContainEqual(
      expect.objectContaining({ code: "UPLOAD_CLEANUP_FAILED" }),
    );
  });
});

// Express 5's overloaded route typings are overly strict for the authenticated
// request shape (authenticateFirebase adds req.user at runtime).
// @ts-nocheck
/**
 * Privileged API used by the desktop gallery application.
 *
 * This deliberately lives on the server: desktop clients never receive a
 * service-account key and every operation is protected by the same Firebase
 * authentication and admin allow-list used by the admin UI.
 */
import express from "express";
import { randomUUID, createHash } from "node:crypto";
import { Readable } from "node:stream";
import { db, FieldValue, storage } from "./firebase-admin.js";
import { authenticateFirebase, sendGmailEmail } from "./email-routes.js";
import { getClientWhatsAppPhone, getWhatsAppLink } from "../../../lib/shared-src/phone-utils";

const router = express.Router();
const ADMIN_EMAILS = new Set(["gennaro.mazzacane@gmail.com"]);
const adminOnly = (req: any, res: express.Response, next: express.NextFunction) =>
  ADMIN_EMAILS.has(String(req.user?.email || "").toLowerCase())
    ? next()
    : res.status(403).json({ error: "Access denied: admin account required" });
const auth = [authenticateFirebase, adminOnly] as any;
const clean = (data: Record<string, any>) =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
const galleryRef = (id: string) => db.collection("galleries").doc(id);
const validPosition = (v: any) => v && Number.isFinite(v.x) && Number.isFinite(v.y) && v.x >= 0 && v.x <= 100 && v.y >= 0 && v.y <= 100;
const chapterTitle = (c: any) => c.titolo || c.title || c.name || "";
const validId = (id: any) => typeof id === "string" && id.length > 0 && id.length <= 200 && !id.includes("/");
const galleryClientIds = (gallery: any) => [...new Set([
  ...(Array.isArray(gallery.clientIds) ? gallery.clientIds : []),
  ...(Array.isArray(gallery.clientiIds) ? gallery.clientiIds : []),
  gallery.clienteId,
].filter(validId))];
const publicGalleryUrl = (gallery: any): string | null => {
  if (typeof gallery.code === "string" && gallery.code.trim()) {
    return `https://imagestudiofotografico.com/gallery/${encodeURIComponent(gallery.code.trim())}`;
  }
  try {
    const url = new URL(String(gallery.publicUrl || ""));
    if (url.protocol !== "https:" || url.hostname !== "imagestudiofotografico.com" ||
        url.port || !url.pathname.startsWith("/gallery/") || url.username || url.password)
      return null;
    return url.toString();
  } catch {
    return null;
  }
};
const galleryAccess = (gallery: any, secrets: any) => {
  const mode = gallery.accessMode || (gallery.pinEnabled || gallery.hasSpecialPin || secrets.specialPin ? "pin"
    : gallery.passwordEnabled || gallery.hasPassword || gallery.requiresSecurityQuestion || secrets.password || gallery.password ? "password" : "open");
  return mode === "pin"
    ? { mode: "pin" as const, value: secrets.specialPin || gallery.specialPin }
    : mode === "password"
      ? { mode: "password" as const, value: secrets.password || gallery.password }
      : { mode: "open" as const };
};
const whatsappHandoffCollection = () => db.collection("desktopWhatsappHandoffs");
const whatsappHandoffRef = (token: string) =>
  whatsappHandoffCollection().doc(createHash("sha256").update(token).digest("hex"));
const WHATSAPP_HANDOFF_TTL_MS = 2 * 60 * 1000;
const cleanupExpiredWhatsAppHandoffs = async (now = Date.now()) => {
  const expired = await whatsappHandoffCollection().where("expiresAt", "<=", now).limit(100).get();
  await Promise.all(expired.docs.map((doc: any) => doc.ref.delete()));
};
const galleryWhatsAppDetails = async (galleryId: string, clientId: string) => {
  if (!validId(clientId)) return { status: 400, error: "Seleziona un cliente valido." };
  const gallerySnap = await galleryRef(galleryId).get();
  if (!gallerySnap.exists) return { status: 404, error: "Galleria non trovata." };
  const gallery = gallerySnap.data() || {};
  if (!galleryClientIds(gallery).includes(clientId))
    return { status: 403, error: "Puoi condividere la galleria solo con un cliente associato." };

  const clientSnap = await db.collection("clienti").doc(clientId).get();
  if (!clientSnap.exists) return { status: 404, error: "Cliente non trovato." };
  const client = clientSnap.data() || {};
  const phone = getClientWhatsAppPhone(client);
  if (!phone)
    return { status: 409, error: "Il cliente associato non ha un numero WhatsApp o cellulare valido." };

  const galleryUrl = publicGalleryUrl(gallery);
  if (!galleryUrl) return { status: 400, error: "La galleria non ha un link pubblico valido." };

  const secrets = (await db.collection("gallerySecrets").doc(galleryId).get()).data() || {};
  const access = galleryAccess(gallery, secrets);
  if (access.mode !== "open" && (typeof access.value !== "string" || !access.value.trim()))
    return { status: 409, error: "La galleria è protetta ma non ha una password o un PIN salvato. Salva prima la credenziale nelle Impostazioni." };

  const clientName = [client.nome, client.cognome].filter(Boolean).join(" ").trim();
  const galleryName = String(gallery.name || gallery.code || "Galleria").replace(/[\r\n]+/g, " ").trim();
  const message = [
    `Ciao${clientName ? ` ${clientName}` : ""}, ecco il link alla galleria ${galleryName}:`,
    galleryUrl,
    ...(access.mode === "open" ? [] : [
      "",
      `${access.mode === "pin" ? "PIN" : "Password"} di accesso: ${access.value}`,
    ]),
  ].join("\n");
  return { status: 200, phone, message };
};
const chaptersOf = (data: any) => Array.isArray(data?.chapters) ? data.chapters : [];
const storageUrl = (path: string, token: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${storage.bucket().name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
const sessionRef = (path: string) => db.collection("desktopUploadSessions").doc(createHash("sha256").update(path).digest("hex"));
const deleteObjectIfPresent = async (path: any) => {
  if (typeof path !== "string" || !path) return true;
  // Storage deletion is deliberately best effort.  A retry after a successful
  // delete must not prevent the corresponding Firestore cleanup.
  try { await storage.bucket().file(path).delete(); return true; }
  catch (error: any) {
    // A missing object is already in the desired state. Other failures must
    // be surfaced so callers can retry without losing metadata.
    if (error?.code === 404 || error?.statusCode === 404) return true;
    return false;
  }
};
const galleryExists = async (id: string) => (await galleryRef(id).get()).exists;
const SECRET_FIELDS = new Set(["password", "specialPin", "securityAnswer", "hasPassword", "hasSpecialPin", "passwordEnabled", "pinEnabled"]);
const rejectSecretFields = (body: Record<string, any>) => Object.keys(body).filter(key => SECRET_FIELDS.has(key));
const associationFields = (body: Record<string, any>) => {
  const result = { ...body };
  const suppliedClients = body.clientIds !== undefined || body.clientiIds !== undefined;
  if (suppliedClients) {
    const ids = body.clientIds ?? body.clientiIds;
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((id: any) => !validId(id)))
      throw new Error("Invalid client association");
    result.clientIds = [...new Set(ids)];
    result.clientiIds = result.clientIds;
    result.clienteId = result.clientIds[0] ?? null;
  }
  // clientId is a desktop/UI convenience field, not a gallery schema field.
  delete result.clientId;
  return { result, suppliedClients };
};
const associationJob = (value: any) => value === null || value === "" ? null : value;
const associationWriteFields = (normalized: { result: Record<string, any>; suppliedClients: boolean }, old: any) => {
  const updates = { ...normalized.result };
  const clientIds = normalized.suppliedClients ? updates.clientIds : galleryClientIds(old);
  updates.clientIds = clientIds;
  updates.clientiIds = clientIds;
  updates.clienteId = clientIds[0] ?? null;
  if (updates.jobId !== undefined) updates.jobId = associationJob(updates.jobId);
  return updates;
};
async function validateAssociationInputs(jobId: any, clientIds: string[]) {
  if (jobId !== undefined && jobId !== null && jobId !== "" &&
      (!validId(jobId) || !(await db.collection("jobs").doc(jobId).get()).exists))
    throw new Error("Job association not found");
  if (!clientIds.length) return;
  const clients = await db.getAll(...clientIds.map(id => db.collection("clienti").doc(id)));
  if (clients.some((snap: any) => !snap.exists)) throw new Error("Client association not found");
}
async function syncAssociationLinks(tx: any, galleryId: string, oldData: any, newJobId: any, newClientIds: string[]) {
  const oldJobId = associationJob(oldData?.jobId);
  const oldClientIds = galleryClientIds(oldData || {}).filter(validId);
  const jobIds = [...new Set([oldJobId, newJobId].filter(Boolean))];
  const clientIds = [...new Set([...oldClientIds, ...newClientIds])];
  const refs = [
    ...jobIds.map(id => db.collection("jobs").doc(id)),
    ...clientIds.map(id => db.collection("clienti").doc(id)),
  ];
  const snaps = await Promise.all(refs.map((ref: any) => tx.get(ref)));
  let index = 0;
  for (const id of jobIds) {
    const snap = snaps[index++];
    if (!snap.exists) {
      if (id === newJobId) throw new Error("Job association not found");
      continue; // old reverse links may point to deleted jobs
    }
    const current = Array.isArray(snap.data()?.galleryIds) ? snap.data().galleryIds : [];
    const galleryIds = (id === newJobId ? [...current, galleryId] : current.filter((v: any) => v !== galleryId));
    tx.update(db.collection("jobs").doc(id), { galleryIds: [...new Set(galleryIds)], updatedAt: FieldValue.serverTimestamp() });
  }
  for (const id of clientIds) {
    const snap = snaps[index++];
    if (!snap.exists) {
      if (newClientIds.includes(id)) throw new Error("Client association not found");
      continue;
    }
    const data = snap.data() || {}, sourceRefs = data.sourceRefs && typeof data.sourceRefs === "object" ? data.sourceRefs : {};
    const current = Array.isArray(sourceRefs.galleryIds) ? sourceRefs.galleryIds : [];
    const galleryIds = newClientIds.includes(id) ? [...current, galleryId] : current.filter((v: any) => v !== galleryId);
    tx.update(db.collection("clienti").doc(id), {
      sourceRefs: { ...sourceRefs, galleryIds: [...new Set(galleryIds)] },
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}
async function verifyImage(file: any, expectedHash: string | null, contentType: string) {
  const digest = createHash("sha256");
  let prefix = Buffer.alloc(0);
  for await (const chunk of file.createReadStream() as Readable) {
    if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk]).subarray(0, 16);
    digest.update(chunk);
  }
  const signature = contentType === "image/jpeg" ? prefix.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    : contentType === "image/png" ? prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : contentType === "image/webp" ? prefix.toString("ascii", 0, 4) === "RIFF" && prefix.toString("ascii", 8, 12) === "WEBP"
    : contentType === "image/gif" ? ["GIF87a", "GIF89a"].includes(prefix.toString("ascii", 0, 6))
    : ["heic", "heix", "hevc", "heif", "mif1"].includes(prefix.toString("ascii", 8, 12));
  return signature && (!expectedHash || digest.digest("hex").toLowerCase() === expectedHash.toLowerCase());
}
const normalizeGallery = (id: string, data: Record<string, any>) => {
  // Legacy gallery documents occasionally contain credentials.  Never spread
  // those fields into any desktop response, even for an allowlisted admin.
  const { password, specialPin, securityAnswer, ...safeData } = data;
  return ({
  ...safeData,
  id,
  status: data.status || (data.active === false ? "archived" : "published"),
  archived: data.active === false,
  eventDate: data.eventDate || data.date,
  coverUrl: data.coverImageDesktop || data.coverUrl || data.coverImageUrl,
  mobileCoverUrl: data.mobileCoverUrl || data.coverImageMobile,
  focalPoint: data.focalPoint || data.coverImageDesktopPosition,
  mobileFocalPoint: data.coverImageMobilePosition || { x: 50, y: 50 },
  headerStyle: data.headerStyle || data.headerTheme,
  publicUrl: data.publicUrl || (data.code ? `https://imagestudiofotografico.com/gallery/${data.code}` : undefined),
  passwordEnabled: data.passwordEnabled ?? data.hasPassword ?? data.requiresSecurityQuestion ?? false,
  pinEnabled: data.pinEnabled ?? data.hasSpecialPin ?? false,
  chapterCount: Array.isArray(data.chapters) ? data.chapters.length : 0,
  selectionRequiredCount: data.selectionRequiredCount ?? data.requiredPhotoCount,
  clientIds: galleryClientIds(data),
  });
};
const legacyGalleryUpdates = (body: Record<string, any>) => {
  const updates = { ...body };
  if (body.eventDate !== undefined) updates.date = body.eventDate;
  if (body.coverUrl !== undefined) updates.coverImageDesktop = body.coverUrl;
  if (body.mobileCoverUrl !== undefined) updates.coverImageMobile = body.mobileCoverUrl;
  if (body.focalPoint !== undefined) updates.coverImageDesktopPosition = body.focalPoint;
  if (body.headerStyle !== undefined) updates.headerTheme = body.headerStyle;
  if (body.passwordEnabled !== undefined) updates.requiresSecurityQuestion = body.passwordEnabled;
  if (body.pinEnabled !== undefined) updates.hasSpecialPin = body.pinEnabled;
  if (body.status !== undefined) updates.active = body.status !== "archived";
  delete updates.archived;
  delete updates.chapterCount;
  delete updates.selectionRequiredCount;
  return updates;
};

// This handoff is a short-lived, single-use capability. It contains no
// credential or recipient details; those are re-read and validated server-side.
router.get("/galleries/whatsapp-handoff/:token", async (req, res) => {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Referrer-Policy", "no-referrer");
  res.set("X-Robots-Tag", "noindex, nofollow");
  const token = String(req.params.token || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
    return res.status(404).send("Link di condivisione non valido o scaduto.");

  const ref = whatsappHandoffRef(token);
  let handoff: any = null;
  await db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = snap.data() || {};
    if (typeof data.expiresAt !== "number" || data.expiresAt <= Date.now() ||
        !validId(data.galleryId) || !validId(data.clientId)) {
      tx.delete(ref);
      return;
    }
    handoff = { galleryId: data.galleryId, clientId: data.clientId };
    tx.delete(ref);
  });
  if (!handoff) return res.status(404).send("Link di condivisione non valido o scaduto.");

  const details = await galleryWhatsAppDetails(handoff.galleryId, handoff.clientId);
  if (details.status !== 200)
    return res.status(details.status).type("text/plain").send(details.error);
  res.redirect(302, getWhatsAppLink(details.phone, details.message));
});

router.use(auth);

// Galleries ---------------------------------------------------------------
router.get("/galleries", async (req, res) => {
  try {
    const search = String(req.query.search || "").toLowerCase().trim();
    const snap = await db.collection("galleries").get();
    const status = String(req.query.status || "").trim();
    const galleries = snap.docs.map(d => normalizeGallery(d.id, d.data())).filter((g: any) =>
      (!search || [g.name, g.code, g.location, g.description].some(v => String(v || "").toLowerCase().includes(search)))
      && (!status || g.status === status));
    galleries.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    res.json({ galleries });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});
router.get("/galleries/:galleryId", async (req, res) => {
  const snap = await galleryRef(req.params.galleryId).get();
  return snap.exists ? res.json(normalizeGallery(snap.id, snap.data() || {})) : res.status(404).json({ error: "Gallery not found" });
});

// Secrets are never part of a gallery response.  These endpoints are kept on
// the privileged desktop API so a desktop build cannot write gallerySecrets
// directly (and so changing a gallery cannot accidentally expose credentials).
router.get("/galleries/:galleryId/secrets", async (req, res) => {
  if (!(await galleryExists(req.params.galleryId))) return res.status(404).json({ error: "Gallery not found" });
  const gallery = (await galleryRef(req.params.galleryId).get()).data() || {};
  const snap = await db.collection("gallerySecrets").doc(req.params.galleryId).get();
  const data = snap.data() || {};
  // Never return the values.  The editor only needs to know which access
  // mechanism is configured; values are write-only through this API.
  res.json({
    accessMode: gallery.accessMode || (data.specialPin ? "pin" : data.password ? "password" : "open"),
    passwordEnabled: gallery.passwordEnabled === true || !!data.password,
    pinEnabled: gallery.pinEnabled === true || !!data.specialPin,
  });
});
router.put("/galleries/:galleryId/secrets", async (req, res) => {
  if (!(await galleryExists(req.params.galleryId))) return res.status(404).json({ error: "Gallery not found" });
  const accessMode = req.body?.accessMode || ((req.body?.specialPin != null) ? "pin" : "password");
  if (!["open", "password", "pin"].includes(accessMode))
    return res.status(400).json({ error: "Invalid access mode" });
  const theme = req.body?.specialTheme;
  if (theme !== undefined && theme !== null && (typeof theme !== "string" || !theme.trim() || theme === "none"))
    return res.status(400).json({ error: "Invalid special theme" });
  if (typeof req.body?.password !== "string" && req.body?.password !== null && req.body?.password !== undefined ||
      typeof req.body?.specialPin !== "string" && req.body?.specialPin !== null && req.body?.specialPin !== undefined)
    return res.status(400).json({ error: "Invalid secret" });
  const password = req.body?.password == null ? null : req.body.password.trim();
  const specialPin = req.body?.specialPin == null ? null : req.body.specialPin.trim();
  if (password && specialPin) return res.status(400).json({ error: "Password and PIN are mutually exclusive" });
  if (accessMode === "pin" && password || accessMode === "password" && specialPin)
    return res.status(400).json({ error: "Credential does not match access mode" });
  if (accessMode === "open" && (password || specialPin))
    return res.status(400).json({ error: "Open galleries cannot have a secret" });
  if (password && password.length > 300 || specialPin && specialPin.length > 100)
    return res.status(400).json({ error: "Secret is too long" });
  try {
    await db.runTransaction(async tx => {
    const gallery = galleryRef(req.params.galleryId);
    const secrets = db.collection("gallerySecrets").doc(req.params.galleryId);
    const gallerySnap = await tx.get(gallery);
    const secretsSnap = await tx.get(secrets);
    if (!gallerySnap.exists) throw new Error("Gallery not found");
    const oldGallery = gallerySnap.data() || {};
    const oldSecrets = secretsSnap.data() || {};
    const nextTheme = theme === undefined ? oldGallery.specialTheme || null : theme;
    if ((accessMode === "pin") !== !!nextTheme)
      throw new Error("Il tema speciale richiede un PIN; senza tema scegli password o accesso pubblico.");
    const oldMode = oldGallery.accessMode || (oldGallery.pinEnabled || oldGallery.hasSpecialPin || oldSecrets.specialPin ? "pin"
      : oldGallery.passwordEnabled || oldGallery.hasPassword || oldSecrets.password ? "password" : "open");
    const value = accessMode === "password" ? password : specialPin;
    const retained = accessMode === oldMode && (accessMode === "password"
      ? oldSecrets.password || oldGallery.password : oldSecrets.specialPin || oldGallery.specialPin);
    if (accessMode !== "open" && !(value || retained))
      throw new Error("Inserisci una nuova password o un PIN prima di attivare la protezione.");
    tx.set(secrets, { password: accessMode === "password" ? value || retained : null,
      specialPin: accessMode === "pin" ? value || retained : null,
      updatedAt: FieldValue.serverTimestamp(), updatedBy: req.user.uid });
    tx.update(gallery, { accessMode, passwordEnabled: accessMode === "password", pinEnabled: accessMode === "pin",
      requiresSecurityQuestion: accessMode === "password", hasPassword: accessMode === "password",
      hasSpecialPin: accessMode === "pin", ...(theme !== undefined ? { specialTheme: theme } : {}),
      updatedAt: FieldValue.serverTimestamp() });
    });
    res.json({ success: true, passwordEnabled: accessMode === "password", pinEnabled: accessMode === "pin" });
  } catch (e: any) { res.status(e.message === "Gallery not found" ? 404 : 400).json({ error: e.message }); }
});

// Settings is the non-secret part of the editor contract.  In particular,
// returning the complete gallery document here would re-introduce legacy
// password/specialPin fields, so use the same normalized public shape.
router.get("/galleries/:galleryId/settings", async (req, res) => {
  const snap = await galleryRef(req.params.galleryId).get();
  return snap.exists ? res.json(normalizeGallery(snap.id, snap.data() || {})) : res.status(404).json({ error: "Gallery not found" });
});
router.put("/galleries/:galleryId/settings", async (req, res) => {
  const { password, specialPin, securityAnswer, ...settings } = req.body || {};
  if (!(await galleryExists(req.params.galleryId))) return res.status(404).json({ error: "Gallery not found" });
  if (password !== undefined || specialPin !== undefined || securityAnswer !== undefined || rejectSecretFields(req.body || {}).length ||
      ["id", "createdAt", "updatedAt", "accessMode", "specialTheme"].some(k => k in settings))
    return res.status(400).json({ error: "Server-owned or secret field supplied" });
  try {
    const normalized = associationFields(settings);
    const clientIds = normalized.result.clientIds ?? normalized.result.clientiIds;
    await validateAssociationInputs(normalized.result.jobId, clientIds || []);
    await db.runTransaction(async (tx: any) => {
      const ref = galleryRef(req.params.galleryId), snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Gallery not found");
      const old = snap.data() || {};
      const hasAssociationChange = normalized.result.jobId !== undefined || normalized.suppliedClients;
      const updates = hasAssociationChange ? associationWriteFields(normalized, old) : normalized.result;
      if (hasAssociationChange)
        await syncAssociationLinks(tx, req.params.galleryId, old, updates.jobId !== undefined
          ? updates.jobId : associationJob(old.jobId), updates.clientIds);
      tx.update(ref, { ...legacyGalleryUpdates(updates), updatedAt: FieldValue.serverTimestamp() });
    });
    res.json({ success: true });
  } catch (e: any) {
    res.status(e.message === "Gallery not found" ? 404 : 400).json({ error: e.message });
  }
});
router.post("/galleries", async (req, res) => {
  const body = req.body || {};
  if (!body.name && !body.code) return res.status(400).json({ error: "name or code is required" });
  if (rejectSecretFields(body).length) return res.status(400).json({ error: "Secrets must be configured through the secret endpoint" });
  try {
    const normalized = associationFields(body);
    const clientIds = normalized.result.clientIds ?? normalized.result.clientiIds ?? [];
    await validateAssociationInputs(normalized.result.jobId, clientIds);
    const ref = db.collection("galleries").doc(randomUUID());
    await db.runTransaction(async (tx: any) => {
      await syncAssociationLinks(tx, ref.id, {}, associationJob(normalized.result.jobId), clientIds);
      tx.create(ref, clean({ ...legacyGalleryUpdates(normalized.result), active: body.status === "archived" ? false : body.active !== false, photoCount: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }));
    });
    res.status(201).json({ id: ref.id });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});
router.patch("/galleries/:galleryId", async (req, res) => {
  if (rejectSecretFields(req.body || {}).length) return res.status(400).json({ error: "Secrets must be configured through the secret endpoint" });
  if (!(await galleryExists(req.params.galleryId))) return res.status(404).json({ error: "Gallery not found" });
  const { id, createdAt, updatedAt, securityAnswer, ...updates } = req.body || {};
  for (const key of ["coverUrl", "mobileCoverUrl", "coverImageDesktop", "coverImageMobile", "coverImageUrl", "focalPoint", "mobileFocalPoint", "coverImageDesktopPosition", "coverImageMobilePosition"]) delete updates[key];
  if (securityAnswer !== undefined || "specialTheme" in updates || "accessMode" in updates)
    return res.status(400).json({ error: "Access and theme must be configured through the secret endpoint" });
  try {
    const normalized = associationFields(updates);
    const clientIds = normalized.result.clientIds ?? normalized.result.clientiIds;
    await validateAssociationInputs(normalized.result.jobId, clientIds || []);
    await db.runTransaction(async (tx: any) => {
      const ref = galleryRef(req.params.galleryId), snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Gallery not found");
      const old = snap.data() || {};
      const hasAssociationChange = normalized.result.jobId !== undefined || normalized.suppliedClients;
      const updates = hasAssociationChange ? associationWriteFields(normalized, old) : normalized.result;
      if (hasAssociationChange)
        await syncAssociationLinks(tx, req.params.galleryId, old, updates.jobId !== undefined
          ? updates.jobId : associationJob(old.jobId), updates.clientIds);
      tx.update(ref, { ...legacyGalleryUpdates(updates), updatedAt: FieldValue.serverTimestamp() });
    });
    res.json({ success: true });
  } catch (e: any) { res.status(e.message === "Gallery not found" ? 404 : 400).json({ error: e.message }); }
});
router.put("/galleries/:galleryId", async (req, res) => {
  if (rejectSecretFields(req.body || {}).length) return res.status(400).json({ error: "Secrets must be configured through the secret endpoint" });
  if (!(await galleryExists(req.params.galleryId))) return res.status(404).json({ error: "Gallery not found" });
  const { id, createdAt, updatedAt, ...updates } = req.body || {};
  try {
    const normalized = associationFields(updates);
    const clientIds = normalized.result.clientIds ?? normalized.result.clientiIds;
    await validateAssociationInputs(normalized.result.jobId, clientIds || []);
    await db.runTransaction(async (tx: any) => {
      const ref = galleryRef(req.params.galleryId), snap = await tx.get(ref);
      if (!snap.exists) throw new Error("Gallery not found");
      const old = snap.data() || {};
      const hasAssociationChange = normalized.result.jobId !== undefined || normalized.suppliedClients;
      const updates = hasAssociationChange ? associationWriteFields(normalized, old) : normalized.result;
      if (hasAssociationChange)
        await syncAssociationLinks(tx, req.params.galleryId, old, updates.jobId !== undefined
          ? updates.jobId : associationJob(old.jobId), updates.clientIds);
      tx.update(ref, { ...legacyGalleryUpdates(updates), updatedAt: FieldValue.serverTimestamp() });
    });
    res.json({ success: true });
  } catch (e: any) { res.status(e.message === "Gallery not found" ? 404 : 400).json({ error: e.message }); }
});
router.post("/galleries/:galleryId/archive", async (req, res) => {
  await galleryRef(req.params.galleryId).update({ active: false, updatedAt: FieldValue.serverTimestamp() });
  res.json({ success: true });
});
router.delete("/galleries/:galleryId", async (req, res) => {
  if (req.body?.confirm !== true && req.query.confirm !== "true") return res.status(400).json({ error: "Destructive action requires confirm=true" });
  if (req.body?.permanent !== true) {
    await galleryRef(req.params.galleryId).update({ active: false, archivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return res.json({ success: true, archived: true });
  }
  const photos = await db.collection("photos").where("galleryId", "==", req.params.galleryId).get();
  for (const photoDoc of photos.docs) {
    const photo = photoDoc.data();
    if (!(await deleteObjectIfPresent(photo.storagePath || photo.filePath)))
      return res.status(503).json({ error: "Storage temporarily unavailable; retry deletion" });
    await photoDoc.ref.delete();
  }
  const legacyPhotos = await galleryRef(req.params.galleryId).collection("photos").get();
  for (const photoDoc of legacyPhotos.docs) {
    const photo = photoDoc.data();
    const path = photo.storagePath || photo.filePath;
    if (!(await deleteObjectIfPresent(path)))
      return res.status(503).json({ error: "Storage temporarily unavailable; retry deletion" });
    await photoDoc.ref.delete();
  }
  const galleryData = (await galleryRef(req.params.galleryId).get()).data() || {};
  const coverPaths = [galleryData.coverStoragePath, galleryData.mobileCoverStoragePath].filter(Boolean);
  for (const path of coverPaths)
    if (!(await deleteObjectIfPresent(path))) return res.status(503).json({ error: "Storage temporarily unavailable; retry deletion" });
  await db.collection("gallerySecrets").doc(req.params.galleryId).delete().catch(() => {});
  await db.runTransaction(async (tx: any) => {
    const gallery = galleryRef(req.params.galleryId);
    const snap = await tx.get(gallery);
    if (!snap.exists) throw new Error("Gallery not found");
    const current = snap.data() || {};
    await syncAssociationLinks(tx, req.params.galleryId, current, null, []);
    tx.delete(gallery);
  });
  res.json({ success: true, deleted: true, deletedPhotos: photos.size + legacyPhotos.size });
});

// Photos -------------------------------------------------------------------
async function photoFor(id: string) {
  const snap = await db.collection("photos").doc(id).get();
  return snap.exists ? { ref: snap.ref, ...snap.data(), id: snap.id } as any : null;
}
router.get("/galleries/:galleryId/photos", async (req, res) => {
  const snap = await db.collection("photos").where("galleryId", "==", req.params.galleryId).get();
  const legacySnap = await galleryRef(req.params.galleryId).collection("photos").get();
  const search = String(req.query.search || "").toLowerCase();
  const photos = [
    ...snap.docs.map(d => ({ id: d.id, ...d.data() })),
    ...legacySnap.docs.map(d => ({ id: `legacy-${d.id}`, galleryId: req.params.galleryId, ...d.data() })),
  ].filter((p: any) =>
    !search || [p.name, p.originalName, p.uploaderName, p.uploaderEmail].some(v => String(v || "").toLowerCase().includes(search)));
  photos.sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
  res.json({ photos });
});
router.delete("/photos/:photoId", async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Destructive action requires confirm=true" });
  const photo = await photoFor(req.params.photoId);
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  if (!(await deleteObjectIfPresent(photo.storagePath || photo.filePath)))
    return res.status(503).json({ error: "Storage temporarily unavailable; retry deletion" });
  await photo.ref.delete();
  res.json({ success: true });
});
router.delete("/galleries/:galleryId/photos/:photoId", async (req, res) => {
  if (req.body?.confirm !== true && req.query.confirm !== "true") return res.status(400).json({ error: "Destructive action requires confirm=true" });
  const isLegacy = req.params.photoId.startsWith("legacy-");
  const legacyId = req.params.photoId.slice("legacy-".length);
  const legacySnap = isLegacy ? await galleryRef(req.params.galleryId).collection("photos").doc(legacyId).get() : null;
  const photo = isLegacy
    ? (legacySnap?.exists ? { ref: legacySnap.ref, galleryId: req.params.galleryId, ...legacySnap.data() } as any : null)
    : await photoFor(req.params.photoId);
  if (!photo || photo.galleryId !== req.params.galleryId) return res.status(404).json({ error: "Photo not found in gallery" });
  const path = photo.storagePath || (isLegacy ? photo.filePath : undefined);
  if (!(await deleteObjectIfPresent(path)))
    return res.status(503).json({ error: "Storage temporarily unavailable; retry deletion" });
  await photo.ref.delete();
  await db.runTransaction(async tx => {
    const ref = galleryRef(req.params.galleryId);
    const snap = await tx.get(ref);
    const data = snap.data() || {};
    const imageUrl = photo.url;
    tx.update(ref, {
      photoCount: Math.max(0, Number(data.photoCount || 0) - 1),
      chapters: chaptersOf(data).map((c: any) => c.coverPhotoId === req.params.photoId
        ? { ...c, coverPhotoId: null, coverPhotoUrl: null, coverPhotoPosition: null } : c),
      ...(imageUrl && [data.coverImageDesktop, data.coverUrl, data.coverImageUrl].includes(imageUrl)
        ? { coverImageDesktop: null, coverUrl: null, coverImageUrl: null, coverImageDesktopPosition: null } : {}),
      ...(imageUrl && [data.coverImageMobile, data.mobileCoverUrl].includes(imageUrl)
        ? { coverImageMobile: null, mobileCoverUrl: null, coverImageMobilePosition: null } : {}),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  res.json({ success: true });
});
// Assign only photos owned by this gallery. Legacy subcollection IDs are scoped to the gallery.
router.post("/galleries/:galleryId/photos/assign", async (req, res) => {
  const ids = req.body?.photoIds, chapterId = req.body?.chapterId;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 450 || new Set(ids).size !== ids.length ||
      ids.some((id: any) => !validId(id)) || !(chapterId === null || validId(chapterId)))
    return res.status(400).json({ error: "Foto o capitolo non validi" });
  const gallery = await galleryRef(req.params.galleryId).get();
  if (!gallery.exists) return res.status(404).json({ error: "Galleria non trovata" });
  if (chapterId !== null && !chaptersOf(gallery.data()).some((c: any) => c.id === chapterId))
    return res.status(404).json({ error: "Capitolo non trovato" });
  const refs = ids.map((id: string) => id.startsWith("legacy-")
    ? galleryRef(req.params.galleryId).collection("photos").doc(id.slice(7))
    : db.collection("photos").doc(id));
  const snaps = await db.getAll(...refs);
  if (snaps.some((s: any, i: number) => !s.exists || (!ids[i].startsWith("legacy-") && s.data()?.galleryId !== req.params.galleryId)))
    return res.status(404).json({ error: "Una o più foto non appartengono alla galleria" });
  const batch = db.batch();
  snaps.forEach((s: any, i: number) => batch.update(s.ref, { chapterId, chapterPosition: i, updatedAt: FieldValue.serverTimestamp() }));
  const affected = new Set(ids);
  const chapters = chaptersOf(gallery.data());
  if (chapters.some((c: any) => affected.has(c.coverPhotoId) && c.id !== chapterId))
    batch.update(galleryRef(req.params.galleryId), {
      chapters: chapters.map((c: any) => affected.has(c.coverPhotoId) && c.id !== chapterId
        ? { ...c, coverPhotoId: null, coverPhotoUrl: null, coverPhotoPosition: null } : c),
      updatedAt: FieldValue.serverTimestamp()
    });
  await batch.commit();
  res.json({ success: true, count: ids.length });
});
router.post("/galleries/:galleryId/photos/reorder", async (req, res) => {
  const ids: string[] = Array.isArray(req.body?.photoIds) ? req.body.photoIds : [];
  if (!ids.length || ids.length > 450 || ids.some(id => !validId(id)) || new Set(ids).size !== ids.length)
    return res.status(400).json({ error: "Ordine foto non valido" });
  if (!(await galleryRef(req.params.galleryId).get()).exists) return res.status(404).json({ error: "Galleria non trovata" });
  const refs = ids.map(id => id.startsWith("legacy-")
    ? galleryRef(req.params.galleryId).collection("photos").doc(id.slice(7))
    : db.collection("photos").doc(id));
  const snaps = await db.getAll(...refs);
  if (snaps.some((snap: any, index: number) => !snap.exists || (!ids[index].startsWith("legacy-") && snap.data()?.galleryId !== req.params.galleryId)))
    return res.status(404).json({ error: "Una o più foto non appartengono alla galleria" });
  const batch = db.batch();
  snaps.forEach((snap: any, position: number) => batch.update(snap.ref, { position, updatedAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  res.json({ success: true, count: ids.length });
});
router.post("/photos/:photoId/move", async (req, res) => {
  const target = String(req.body?.galleryId || "");
  if (!target || !(await galleryRef(target).get()).exists) return res.status(400).json({ error: "Target gallery not found" });
  const photo = await photoFor(req.params.photoId);
  if (!photo) return res.status(404).json({ error: "Photo not found" });
  await photo.ref.update({ galleryId: target, updatedAt: FieldValue.serverTimestamp() });
  res.json({ success: true, galleryId: target });
});

// Chapters are embedded in the existing gallery document. ------------------
router.get("/galleries/:galleryId/chapters", async (req, res) => {
  const snap = await galleryRef(req.params.galleryId).get();
  if (!snap.exists) return res.status(404).json({ error: "Gallery not found" });
  res.json({ chapters: chaptersOf(snap.data()).sort((a: any, b: any) => (a.ordine ?? a.order ?? 0) - (b.ordine ?? b.order ?? 0)), order: snap.data()?.chaptersOrder || [] });
});
router.post("/galleries/:galleryId/chapters", async (req, res) => {
  const titolo = String(req.body?.titolo || "").trim();
  if (!titolo || titolo.length > 150 || typeof req.body?.descrizione !== "string" && req.body?.descrizione !== undefined)
    return res.status(400).json({ error: "Titolo o descrizione non validi" });
  const chapter = await db.runTransaction(async tx => {
    const ref = galleryRef(req.params.galleryId), snap = await tx.get(ref);
    if (!snap.exists) return null;
    const chapters = chaptersOf(snap.data());
    const next = { id: randomUUID(), titolo, descrizione: req.body?.descrizione || "", ordine: chapters.length, createdAt: new Date(), updatedAt: new Date() };
    const updated = [...chapters, next];
    tx.update(ref, { chapters: updated, chaptersOrder: updated.map((c: any) => c.id), chaptersEnabled: true, updatedAt: FieldValue.serverTimestamp() });
    return next;
  });
  return chapter ? res.status(201).json({ chapter }) : res.status(404).json({ error: "Galleria non trovata" });
});
router.patch("/galleries/:galleryId/chapters/:chapterId", async (req, res) => {
  const { titolo, descrizione } = req.body || {};
  if ((titolo !== undefined && (typeof titolo !== "string" || !titolo.trim() || titolo.length > 150)) ||
      (descrizione !== undefined && typeof descrizione !== "string"))
    return res.status(400).json({ error: "Dati del capitolo non validi" });
  const found = await db.runTransaction(async tx => {
    const ref = galleryRef(req.params.galleryId), snap = await tx.get(ref);
    const chapters = chaptersOf(snap.data());
    if (!snap.exists || !chapters.some((c: any) => c.id === req.params.chapterId)) return false;
    tx.update(ref, { chapters: chapters.map((c: any) => c.id === req.params.chapterId
      ? { ...c, ...(titolo !== undefined ? { titolo: titolo.trim() } : {}), ...(descrizione !== undefined ? { descrizione } : {}), updatedAt: new Date() } : c), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return found ? res.json({ success: true }) : res.status(404).json({ error: "Capitolo non trovato" });
});
router.delete("/galleries/:galleryId/chapters/:chapterId", async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Conferma richiesta" });
  const ref = galleryRef(req.params.galleryId), snap = await ref.get();
  if (!snap.exists || !chaptersOf(snap.data()).some((c: any) => c.id === req.params.chapterId))
    return res.status(404).json({ error: "Capitolo non trovato" });
  // Unassign first. A failed write leaves the chapter available for retry.
  for (const collection of [db.collection("photos").where("galleryId", "==", req.params.galleryId).where("chapterId", "==", req.params.chapterId),
    ref.collection("photos").where("chapterId", "==", req.params.chapterId)]) {
    const photos = await collection.get();
    for (let i = 0; i < photos.docs.length; i += 450) {
      const batch = db.batch();
      photos.docs.slice(i, i + 450).forEach((p: any) => batch.update(p.ref, { chapterId: null, chapterPosition: null }));
      await batch.commit();
    }
  }
  await db.runTransaction(async tx => {
    const current = await tx.get(ref), chapters = chaptersOf(current.data()).filter((c: any) => c.id !== req.params.chapterId);
    tx.update(ref, { chapters, chaptersOrder: chapters.map((c: any) => c.id), chaptersEnabled: chapters.length > 0, updatedAt: FieldValue.serverTimestamp() });
  });
  res.json({ success: true });
});
router.post("/galleries/:galleryId/chapters/reorder", async (req, res) => {
  const ids = req.body?.chapterIds;
  if (!Array.isArray(ids) || ids.some((v: any) => !validId(v))) return res.status(400).json({ error: "Ordine non valido" });
  const found = await db.runTransaction(async tx => {
    const ref = galleryRef(req.params.galleryId), snap = await tx.get(ref);
    if (!snap.exists) return false;
    const chapters = chaptersOf(snap.data());
    if (ids.length !== chapters.length || new Set(ids).size !== ids.length || chapters.some((c: any) => !ids.includes(c.id))) return false;
    tx.update(ref, { chapters: ids.map((id: string, ordine: number) => ({ ...chapters.find((c: any) => c.id === id), ordine })), chaptersOrder: ids, updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return found ? res.json({ success: true }) : res.status(400).json({ error: "Capitoli non corrispondenti" });
});
router.post("/galleries/:galleryId/chapters/:chapterId/cover", async (req, res) => {
  const photoId = req.body?.photoId, position = req.body?.position;
  if (!(photoId === null || validId(photoId)) || (position !== undefined && !validPosition(position)))
    return res.status(400).json({ error: "Copertina non valida" });
  const ref = galleryRef(req.params.galleryId), snap = await ref.get();
  if (!snap.exists || !chaptersOf(snap.data()).some((c: any) => c.id === req.params.chapterId))
    return res.status(404).json({ error: "Capitolo non trovato" });
  const photo = photoId?.startsWith("legacy-")
    ? await ref.collection("photos").doc(photoId.slice(7)).get()
    : photoId ? await db.collection("photos").doc(photoId).get() : null;
  if (photoId && (!photo?.exists || (!photoId.startsWith("legacy-") && photo.data()?.galleryId !== req.params.galleryId) || photo.data()?.chapterId !== req.params.chapterId))
    return res.status(400).json({ error: "La foto non appartiene al capitolo" });
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!chaptersOf(current.data()).some((c: any) => c.id === req.params.chapterId)) throw new Error("Capitolo rimosso");
    tx.update(ref, { chapters: chaptersOf(current.data()).map((c: any) => c.id === req.params.chapterId
      ? { ...c, coverPhotoId: photoId, coverPhotoUrl: photoId ? photo.data()?.url : null, coverPhotoPosition: photoId ? (position || c.coverPhotoPosition || { x: 50, y: 50 }) : null } : c), updatedAt: FieldValue.serverTimestamp() });
  });
  res.json({ success: true });
});

// Customer selection configuration -----------------------------------------
router.get("/galleries/:galleryId/customer-selection", async (req, res) => {
  const d = (await galleryRef(req.params.galleryId).get()).data() || {};
  let products = Array.isArray(d.productRequirements) ? d.productRequirements : [];
  // productRequirements is the canonical web shape.  Preserve it verbatim,
  // while resolving catalog names for older records that only stored IDs.
  if (products.length) {
    const ids = [...new Set(products.map((p: any) => p?.prodottoId).filter(Boolean))];
    const catalog = ids.length ? await db.getAll(...ids.map((id: string) => db.collection("products").doc(id))) : [];
    const byId = new Map(catalog.filter((s: any) => s.exists).map((s: any) => [s.id, s.data()]));
    products = products.map((p: any) => ({ ...p, ...(p.prodottoId && byId.has(p.prodottoId) ? {
      prodottoNome: p.prodottoNome || byId.get(p.prodottoId)?.nome,
      prodottoNumeroFoto: p.prodottoNumeroFoto ?? byId.get(p.prodottoId)?.numeroFoto,
    } : {}) }));
  }
  res.json({ selectionEnabled: d.selectionEnabled === true, selectionMode: d.selectionMode || "like", requiredPhotoCount: d.requiredPhotoCount, unlimitedSelection: d.unlimitedSelection === true, selectionStatus: d.selectionStatus || "pending", selectedPhotoIds: d.selectedPhotoIds || [], selectionDeadline: d.selectionDeadline, selectionLocked: d.selectionLocked === true, products, snapshots: d.selectionSnapshots || [] });
});
router.put("/galleries/:galleryId/customer-selection", async (req, res) => {
  const allowed = ["selectionEnabled", "selectionMode", "requiredPhotoCount", "unlimitedSelection", "selectionDeadline", "selectionDeadlineEnforced", "selectionNotes"];
  const updates = clean(Object.fromEntries(allowed.filter(k => req.body?.[k] !== undefined).map(k => [k, req.body[k]])));
  if (req.body?.productRequirements !== undefined) {
    const requirements = req.body.productRequirements;
    if (!Array.isArray(requirements) || requirements.length > 100)
      return res.status(400).json({ error: "Invalid product requirements" });
    const ids = [...new Set(requirements.map((p: any) => p?.prodottoId).filter(Boolean))];
    const catalog = ids.length ? await db.getAll(...ids.map((id: string) => db.collection("products").doc(id))) : [];
    const byId = new Map(catalog.filter((s: any) => s.exists).map((s: any) => [s.id, s.data()]));
    const normalized: any[] = [];
    for (const p of requirements) {
      const id = p?.prodottoId ? String(p.prodottoId) : "";
      const catalogProduct: any = id ? byId.get(id) : null;
      const name = String(p?.prodottoNome ?? p?.nome ?? "").trim();
      const count = Number(p?.prodottoNumeroFoto ?? p?.numeroFoto);
      if (!name || !Number.isSafeInteger(count) || count < 0 || count > 10000 ||
          (id && !catalogProduct) ||
          (catalogProduct && name !== String(catalogProduct.nome || "").trim()))
        return res.status(400).json({ error: "Product requirement does not match catalog" });
      normalized.push({ prodottoId: id || null, prodottoNome: name, prodottoNumeroFoto: count });
    }
    updates.productRequirements = normalized;
    // Product requirements are the source of truth for the selection quota.
    if (normalized.length) {
      updates.requiredPhotoCount = normalized.reduce((sum, p) => sum + p.prodottoNumeroFoto, 0);
      updates.unlimitedSelection = false;
    }
  }
  await galleryRef(req.params.galleryId).update({ ...updates, updatedAt: FieldValue.serverTimestamp() }); res.json({ success: true });
});
router.post("/galleries/:galleryId/customer-selection/unlock", async (req, res) => { await galleryRef(req.params.galleryId).update({ selectionLocked: false, updatedAt: FieldValue.serverTimestamp() }); res.json({ success: true }); });
// Mirrors the web admin reset: a completed selection is archived as a
// "Revisione N" snapshot before the current choices and notes are cleared.
router.post("/galleries/:galleryId/customer-selection/reset", async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: "Conferma richiesta" });
  const ref = galleryRef(req.params.galleryId);
  if (!(await ref.get()).exists) return res.status(404).json({ error: "Galleria non trovata" });
  const snapshot = await db.runTransaction(async tx => {
    const gallery = await tx.get(ref);
    if (!gallery.exists) return null;
    const d = gallery.data() || {};
    const selected: string[] = Array.isArray(d.selectedPhotoIds) ? d.selectedPhotoIds : [];
    const existing: any[] = Array.isArray(d.selectionSnapshots) ? d.selectionSnapshots : [];
    const snap = d.selectionStatus === "completed" && selected.length > 0 ? {
      id: Date.now().toString(), createdAt: new Date().toISOString(), label: `Revisione ${existing.length + 1}`,
      photoAssignments: d.photoAssignments || null, selectedPhotoIds: selected, selectionNotes: d.selectionNotes || "", createdBy: "admin",
    } : null;
    tx.update(ref, {
      ...(snap ? { selectionSnapshots: [...existing, snap] } : {}),
      selectedPhotoIds: [], photoAssignments: {}, selectionStatus: "pending", selectionNotes: "", photoNotes: {}, selectionLocked: false,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return snap;
  });
  res.json({ success: true, snapshot });
});

// Associations used by the desktop pickers.  These deliberately return the
// same Firestore-shaped records as the web editor, without allowing clients to
// mutate jobs or client records through a gallery request.
router.get("/clients", async (req, res) => {
  const search = String(req.query.search || "").toLowerCase().trim();
  const snap = await db.collection("clienti").get();
  const clients = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((c: any) =>
    !search || [c.nome, c.cognome, c.email, c.whatsapp, c.cellulare1, c.cellulare2, c.telefono, c.cellulare]
      .some(v => String(v || "").toLowerCase().includes(search)));
  res.json({ clients, clienti: clients });
});
router.get("/jobs", async (req, res) => {
  const search = String(req.query.search || "").toLowerCase().trim();
  const snap = await db.collection("jobs").get();
  const jobs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((j: any) =>
    !search || [j.nomeEvento, j.name, j.email, j.location].some(v => String(v || "").toLowerCase().includes(search)));
  res.json({ jobs });
});
router.get("/job-types", async (_req, res) => {
  const snap = await db.collection("jobTypes")
    .where("attivo", "==", true)
    .orderBy("ordine", "asc")
    .get();
  const jobTypes = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  res.json({ jobTypes });
});
router.get("/products", async (req, res) => {
  const snap = await db.collection("products").get();
  res.json({ products: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
});

// Same export the web admin builds client-side: selected photos with their
// Lightroom-friendly name (timestamp prefix stripped), chapter and products.
export const lightroomName = (name: string) => (name.match(/^\d+-(.+)$/) || [])[1] || name;
router.get("/galleries/:galleryId/selection-results", async (req, res) => {
  const gallery = await galleryRef(req.params.galleryId).get();
  if (!gallery.exists) return res.status(404).json({ error: "Galleria non trovata" });
  const d = gallery.data() || {};
  const selectedPhotoIds: string[] = Array.isArray(d.selectedPhotoIds) ? d.selectedPhotoIds : [];
  const assignments: Record<string, string[] | string> = d.photoAssignments || {};
  const photoNotes: Record<string, string> = d.photoNotes || {};
  const chapters = chaptersOf(d);
  const products: any[] = Array.isArray(d.productRequirements) ? d.productRequirements : [];
  // The web client stores product assignments as stringified indexes into
  // productRequirements ("0", "1"); older data may hold product ids.
  const productName = (key: string) => {
    const byIndex = /^\d+$/.test(key) ? products[Number(key)] : undefined;
    return (byIndex || products.find(p => p.prodottoId === key))?.prodottoNome || key;
  };
  const photos = (await Promise.all(selectedPhotoIds.filter(validId).map(async id => {
    const p = id.startsWith("legacy-") ? await galleryRef(req.params.galleryId).collection("photos").doc(id.slice(7)).get() : await db.collection("photos").doc(id).get();
    // Modern photos carry their gallery; ignore ids pointing at other galleries.
    const data: any = p.exists && (id.startsWith("legacy-") || p.data()?.galleryId === req.params.galleryId) ? p.data() : {};
    const assigned = assignments[id];
    return { id, name: data.name || data.originalName || id, exportName: lightroomName(data.name || data.originalName || id), url: data.url || null,
      chapterId: data.chapterId || null, chapterName: chapterTitle(chapters.find((c: any) => c.id === data.chapterId) || {}) || null,
      products: (Array.isArray(assigned) ? assigned : assigned ? [assigned] : []).map(productName), note: photoNotes[id] || null };
  })));
  res.json({ galleryId: req.params.galleryId, status: d.selectionStatus || "pending", selectedPhotoIds, assignments, notes: d.selectionNotes || null, photos });
});
router.get("/galleries/:galleryId/history", async (req, res) => {
  const snap = await db.collection("galleryHistory").where("galleryId", "==", req.params.galleryId).get();
  res.json({ history: snap.docs.map((d: any) => ({ id: d.id, ...d.data() })) });
});

// Storage sessions and metadata finalization -------------------------------
router.post("/galleries/:galleryId/upload-sessions", async (req, res) => {
  const originalName = req.body?.fileName;
  const fileName = typeof originalName === "string" ? originalName.replace(/[^a-zA-Z0-9._-]/g, "_") : "";
  const hash = String(req.body?.contentHash || "").toLowerCase(), size = Number(req.body?.size), contentType = req.body?.contentType;
  if (!fileName || originalName.length > 255 || /[/\\\x00-\x1f]/.test(originalName) ||
      !/^[a-f0-9]{64}$/i.test(hash || "") || !Number.isSafeInteger(size) || size <= 0 ||
      size > 500 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif|heic|heif)$/i.test(contentType || "") ||
      !(await galleryRef(req.params.galleryId).get()).exists)
    return res.status(400).json({ error: "File, hash o galleria non validi" });
  if (req.body?.contentHash) {
    const duplicate = await db.collection("photos")
      .where("galleryId", "==", req.params.galleryId)
      .where("contentHash", "==", hash)
      .limit(1)
      .get();
    if (!duplicate.empty) return res.status(409).json({ error: "Duplicate photo content", duplicatePhotoId: duplicate.docs[0].id });
  }
  const storagePath = `galleries/${req.params.galleryId}/photos/${randomUUID()}-${fileName}`;
  await sessionRef(storagePath).set({ galleryId: req.params.galleryId, storagePath, hash, size, contentType, fileName: originalName, chapterName: String(req.body?.chapterName || ""), createdAt: FieldValue.serverTimestamp() });
  const [uploadUrl] = await storage.bucket().file(storagePath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 15 * 60 * 1000, contentType });
  res.status(201).json({ storagePath, uploadUrl, expiresIn: 900, uploadType: "signed-resumable-compatible", metadata: { originalName, contentType, size, contentHash: hash } });
});
router.post("/galleries/:galleryId/photos/finalize", async (req, res) => {
  const b = req.body || {}, hash = String(b.contentHash || "").toLowerCase();
  if (typeof b.storagePath !== "string" || !b.storagePath.startsWith(`galleries/${req.params.galleryId}/photos/`) || !b.name)
    return res.status(400).json({ error: "Percorso o nome non validi" });
  const session = await sessionRef(b.storagePath).get(), s = session.data();
  if (!session.exists || s?.galleryId !== req.params.galleryId || s.storagePath !== b.storagePath ||
      s.hash !== hash || s.size !== b.size || s.contentType !== b.contentType || s.fileName !== b.name ||
      (b.originalName !== undefined && b.originalName !== s.fileName) ||
      s.chapterName !== String(b.chapterName || ""))
    return res.status(400).json({ error: "Sessione upload non valida" });
  const gallery = await galleryRef(req.params.galleryId).get();
  if (!gallery.exists) return res.status(404).json({ error: "Galleria non trovata" });
  const file = storage.bucket().file(b.storagePath);
  const [metadata] = await file.getMetadata().catch(() => [null]);
  if (!metadata) return res.status(400).json({ error: "File non ancora caricato" });
  if (Number(metadata.size) !== s.size || metadata.contentType !== s.contentType)
    return res.status(400).json({ error: "Il file caricato non corrisponde alla sessione" });
  if (!(await verifyImage(file, hash, s.contentType)))
    return res.status(400).json({ error: "Immagine o contenuto del file non validi" });
  if (b.chapterId && !chaptersOf(gallery.data()).some((c: any) => c.id === b.chapterId))
    return res.status(400).json({ error: "Capitolo non valido" });
  const photoRef = db.collection("photos").doc(createHash("sha256").update(`${req.params.galleryId}:${hash}`).digest("hex"));
  if ((await photoRef.get()).exists) return res.status(409).json({ error: "Foto già presente", duplicatePhotoId: photoRef.id });
  const duplicate = await db.collection("photos").where("galleryId", "==", req.params.galleryId).where("contentHash", "==", hash).limit(1).get();
  if (!duplicate.empty) return res.status(409).json({ error: "Foto già presente", duplicatePhotoId: duplicate.docs[0].id });
  const downloadToken = randomUUID();
  await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: downloadToken } });
  const url = storageUrl(b.storagePath, downloadToken);
  let chapterId = b.chapterId;
  const chapterName = String(b.chapterName || "").trim();
  if (!chapterId && chapterName && !["Default", "Senza capitolo"].includes(chapterName)) {
    chapterId = await db.runTransaction(async tx => {
      const ref = galleryRef(req.params.galleryId);
      const gallery = await tx.get(ref);
      const chapters = [...(gallery.data()?.chapters || [])];
       const existing = chapters.find((c: any) => chapterTitle(c).toLowerCase() === chapterName.toLowerCase());
      if (existing) return existing.id;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
       chapters.push({ id, titolo: chapterName, descrizione: "", ordine: chapters.length, createdAt: new Date(), updatedAt: new Date() });
      tx.update(ref, { chapters, chaptersOrder: chapters.map((c: any) => c.id), chaptersEnabled: true, updatedAt: FieldValue.serverTimestamp() });
      return id;
    });
  }
  const created = await db.runTransaction(async tx => {
    const existing = await tx.get(photoRef);
    if (existing.exists) return false;
    tx.create(photoRef, clean({ galleryId: req.params.galleryId, name: b.name, originalName: b.originalName || b.name, storagePath: b.storagePath, url, contentType: s.contentType, size: s.size, contentHash: hash, chapterId, chapterName, uploaderUid: req.user.uid, uploaderEmail: req.user.email, uploaderName: req.user.name || req.user.email, uploadedBy: "admin", likeCount: 0, commentCount: 0, position: 0, createdAt: FieldValue.serverTimestamp() }));
    tx.update(galleryRef(req.params.galleryId), { photoCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    return true;
  });
  return created ? res.status(201).json({ id: photoRef.id }) : res.status(409).json({ error: "Foto già presente", duplicatePhotoId: photoRef.id });
});

router.patch("/galleries/:galleryId/cover", async (req, res) => {
  const { kind, photoId, position } = req.body || {};
  if (!["desktop", "mobile"].includes(kind) || !(photoId === null || validId(photoId)) ||
      (position !== undefined && !validPosition(position))) return res.status(400).json({ error: "Copertina non valida" });
  const ref = galleryRef(req.params.galleryId);
  if (!(await ref.get()).exists) return res.status(404).json({ error: "Galleria non trovata" });
  const p = photoId?.startsWith("legacy-") ? await ref.collection("photos").doc(photoId.slice(7)).get()
    : photoId ? await db.collection("photos").doc(photoId).get() : null;
  if (photoId && (!p?.exists || (!photoId.startsWith("legacy-") && p.data()?.galleryId !== req.params.galleryId) || !p.data()?.url))
    return res.status(400).json({ error: "Foto non appartenente alla galleria" });
  const url = photoId ? p.data().url : null;
  await ref.update({ [kind === "desktop" ? "coverImageDesktop" : "coverImageMobile"]: url,
    [kind === "desktop" ? "coverImageDesktopPosition" : "coverImageMobilePosition"]: photoId ? position || { x: 50, y: 50 } : null,
    ...(kind === "desktop" ? { coverImageUrl: url, coverUrl: url } : { mobileCoverUrl: url }),
    updatedAt: FieldValue.serverTimestamp() });
  res.json({ success: true, url });
});
router.patch("/galleries/:galleryId/cover/position", async (req, res) => {
  const { kind, position } = req.body || {};
  if (!["desktop", "mobile"].includes(kind) || !validPosition(position))
    return res.status(400).json({ error: "Posizione non valida" });
  const ref = galleryRef(req.params.galleryId), snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "Galleria non trovata" });
  if (!(kind === "desktop" ? snap.data()?.coverImageDesktop || snap.data()?.coverUrl || snap.data()?.coverImageUrl
    : snap.data()?.coverImageMobile || snap.data()?.mobileCoverUrl))
    return res.status(400).json({ error: "Nessuna copertina presente" });
  await ref.update({ [kind === "desktop" ? "coverImageDesktopPosition" : "coverImageMobilePosition"]: position, updatedAt: FieldValue.serverTimestamp() });
  res.json({ success: true });
});
router.post("/galleries/:galleryId/covers/upload-sessions", async (req, res) => {
  const { size, contentType } = req.body || {};
  if (!(await galleryRef(req.params.galleryId).get()).exists || !Number.isSafeInteger(size) || size < 1 || size > 30 * 1024 * 1024 ||
      !/^image\/(jpeg|png|webp)$/i.test(contentType || "")) return res.status(400).json({ error: "Immagine non valida (max 30 MB)" });
  const storagePath = `galleries/${req.params.galleryId}/covers/${randomUUID()}`;
  await sessionRef(storagePath).set({ galleryId: req.params.galleryId, storagePath, size, contentType, purpose: "cover", createdAt: FieldValue.serverTimestamp() });
  const [uploadUrl] = await storage.bucket().file(storagePath).getSignedUrl({ version: "v4", action: "write", expires: Date.now() + 900000, contentType });
  res.status(201).json({ storagePath, uploadUrl });
});
router.post("/galleries/:galleryId/covers/finalize", async (req, res) => {
  const { storagePath, kind, position } = req.body || {};
  if (!["desktop", "mobile"].includes(kind) || !validPosition(position) ||
      typeof storagePath !== "string" || !storagePath.startsWith(`galleries/${req.params.galleryId}/covers/`))
    return res.status(400).json({ error: "Copertina non valida" });
  const s = (await sessionRef(storagePath).get()).data();
  if (s?.purpose !== "cover" || s.galleryId !== req.params.galleryId || s.storagePath !== storagePath)
    return res.status(400).json({ error: "Sessione non valida" });
  const file = storage.bucket().file(storagePath), [meta] = await file.getMetadata().catch(() => [null]);
  if (!meta) return res.status(400).json({ error: "File non ancora caricato" });
  if (Number(meta.size) !== s.size || meta.contentType !== s.contentType)
    return res.status(400).json({ error: "File non corrispondente" });
  if (!(await verifyImage(file, null, s.contentType)))
    return res.status(400).json({ error: "File immagine non valido" });
  const token = meta.metadata?.firebaseStorageDownloadTokens || randomUUID();
  if (!meta.metadata?.firebaseStorageDownloadTokens) await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  const url = storageUrl(storagePath, token);
  await galleryRef(req.params.galleryId).update({
    [kind === "desktop" ? "coverImageDesktop" : "coverImageMobile"]: url,
    [kind === "desktop" ? "coverStoragePath" : "mobileCoverStoragePath"]: storagePath,
    [kind === "desktop" ? "coverImageDesktopPosition" : "coverImageMobilePosition"]: position,
    ...(kind === "desktop" ? { coverImageUrl: url, coverUrl: url } : { mobileCoverUrl: url }),
    updatedAt: FieldValue.serverTimestamp()
  });
  res.json({ success: true, url });
});

router.post("/galleries/:galleryId/whatsapp-share", async (req, res) => {
  const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.trim() : "";
  const details = await galleryWhatsAppDetails(req.params.galleryId, clientId);
  if (details.status !== 200) return res.status(details.status).json({ error: details.error });

  await cleanupExpiredWhatsAppHandoffs();
  const token = randomUUID();
  await whatsappHandoffRef(token).set({
    galleryId: req.params.galleryId,
    clientId,
    expiresAt: Date.now() + WHATSAPP_HANDOFF_TTL_MS,
    createdBy: req.user.uid,
  });
  res.set("Cache-Control", "no-store, max-age=0");
  res.json({
    handoffPath: `${req.baseUrl}/galleries/whatsapp-handoff/${token}`,
    expiresInSeconds: WHATSAPP_HANDOFF_TTL_MS / 1000,
  });
});

router.post("/galleries/:galleryId/share", async (req, res) => {
  const to = String(req.body?.to || req.body?.email || "").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || /[\r\n]/.test(to))
    return res.status(400).json({ error: "Inserisci un indirizzo email valido." });
  const snap = await galleryRef(req.params.galleryId).get();
  if (!snap.exists) return res.status(404).json({ error: "Galleria non trovata." });
  const g = snap.data() || {};
  const publicUrl = publicGalleryUrl(g);
  if (!publicUrl) return res.status(400).json({ error: "La galleria non ha un link pubblico valido." });
  const secrets = (await db.collection("gallerySecrets").doc(req.params.galleryId).get()).data() || {};
  const access = galleryAccess(g, secrets);
  if (access.mode !== "open" && (typeof access.value !== "string" || !access.value.trim()))
    return res.status(409).json({ error: "La galleria è protetta ma non ha una password o un PIN salvato. Salva prima la credenziale nelle Impostazioni." });
  if (access.mode !== "open") {
    // Only send plaintext access credentials to a client who is linked to this
    // gallery; a typo in a free-form address must not disclose gallery access.
    const refs = galleryClientIds(g).map((id: string) => db.collection("clienti").doc(id));
    const clients = refs.length ? await db.getAll(...refs) : [];
    if (!clients.some((client: any) => client.exists &&
      typeof client.data()?.email === "string" && client.data().email.trim().toLowerCase() === to.toLowerCase()))
      return res.status(403).json({ error: "Per inviare la password o il PIN, scegli l'email di un cliente associato alla galleria." });
  }
  const { desktopGalleryShareHtml, desktopGalleryShareSubject } = await import("./email-templates/desktop-gallery-share.js");
  const name = String(g.name || g.code || "Galleria");
  try {
    await sendGmailEmail(to, desktopGalleryShareSubject(name), desktopGalleryShareHtml({
      galleryName: name, galleryUrl: publicUrl, access,
    }));
  } catch {
    return res.status(502).json({ error: "Invio non confermato. Controlla la posta del destinatario prima di riprovare." });
  }
  // The credential is included in the requested email, never in the API response.
  res.json({ success: true, publicUrl });
});
router.post("/sync", async (req, res) => {
  const ref = await db.collection("desktopSyncJobs").add({ type: req.body?.type || "gallery", galleryId: req.body?.galleryId, status: "queued", requestedBy: req.user.uid, createdAt: FieldValue.serverTimestamp() });
  res.status(202).json({ jobId: ref.id, status: "queued" });
});
router.get("/sync/:jobId", async (req, res) => { const s = await db.collection("desktopSyncJobs").doc(req.params.jobId).get(); return s.exists ? res.json({ id: s.id, ...s.data() }) : res.status(404).json({ error: "Sync job not found" }); });

export default router;
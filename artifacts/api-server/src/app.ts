import express, { type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import emailRoutes from "./email-routes";
import bookingRoutes from "./booking-routes";
import orderRoutes from "./order-routes";
import jobRoutes from "./job-routes";
import paymentScheduleRoutes from "./payment-schedule-routes";
import quoteRoutes from "./quote-routes";
import importRoutes from "./import-routes";
import consultationRoutes from "./consultation-routes";
import calendarRoutes from "./calendar-routes";
import receiptRoutes from "./receipt-routes";
import invoiceRoutes from "./invoice-routes";
import placesRoutes from "./places-routes";
import collaboratoriRoutes from "./collaboratori-routes";
import labRoutes from "./lab-routes";
import productsRoutes from "./products-routes";
import migrationRoutes from "./migration-routes";
import adminRoutes from "./admin-routes";
import adminSecurityRoutes from "./admin-security/admin-security-routes";
import galleryRoutes from "./gallery-routes";
import bulkEmailRoutes from "./bulk-email-routes";
import reminderRoutes from "./reminder-routes";
import followUpRoutes from "./follow-up-routes";
import backupRoutes from "./backup-routes";
import auditRoutes from "./audit-routes";
import gdprRoutes from "./gdpr-routes";
import infoFormRoutes from "./info-form-routes";
import photobookRoutes from "./photobook-routes";
import blogRoutes from "./blog-routes";
import weddingSeoRoutes from "./wedding-seo";
import printShopRoutes from "./print-shop/router";
import giftCardRoutes from "./gift-cards";
import desktopGalleryRoutes from "./desktop-gallery-routes";
import { generateDynamicSitemap } from "./sitemap-generator";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/images/gennaro-mazzacane.jpg", (_req, res) => {
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  const fileName = "DSCF7220 copia (Grande)_1763486024338.jpg";
  const candidates = [
    path.resolve(process.cwd(), "attached_assets", fileName),
    path.resolve(process.cwd(), "..", "..", "attached_assets", fileName),
  ];
  const imagePath = candidates.find(existsSync);
  if (!imagePath) {
    res.sendStatus(404);
    return;
  }
  res.sendFile(imagePath);
});

app.get("/sitemap.xml", async (_req, res) => {
  try {
    res
      .type("application/xml")
      .setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(await generateDynamicSitemap());
  } catch (err) {
    logger.error({ err }, "Unable to generate sitemap");
    res.status(500).send("Errore generazione sitemap");
  }
});

app.use("/api", router);
app.use("/api/email", emailRoutes);
app.use("/api/booking", bookingRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/payment-schedules", paymentScheduleRoutes);
app.use("/api/quotes", quoteRoutes);
app.use("/api/import", importRoutes);
app.use("/api/consultations", consultationRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/receipts", receiptRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/places", placesRoutes);
app.use("/api", collaboratoriRoutes);
app.use("/api", labRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/migrations", migrationRoutes);
app.use("/api/admin/security", adminSecurityRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/galleries", galleryRoutes);
app.use("/api/bulk-email", bulkEmailRoutes);
app.use("/api/reminders", reminderRoutes);
app.use("/api/follow-ups", followUpRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/gdpr", gdprRoutes);
app.use("/api/info-forms", infoFormRoutes);
app.use("/api/photobooks", photobookRoutes);
app.use("/api/blog", blogRoutes);
app.use("/api/wedding-seo", weddingSeoRoutes);
app.use("/api/print-shop", printShopRoutes);
app.use("/api/gift-cards", giftCardRoutes);
app.use("/api/desktop", desktopGalleryRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

export default app;

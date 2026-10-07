/**
 * Minimal API for the local administrator-passkey browser test.
 *
 * This deliberately mounts only the security router; do not replace it with
 * the normal API entry point, which starts scheduled maintenance workers.
 */
import express from "express";
import adminSecurityRoutes from "./src/admin-security/admin-security-routes.js";

const app = express();
app.use(express.json());
app.use("/api/admin/security", adminSecurityRoutes);

const port = Number(process.env.PORT ?? "5910");
app.listen(port, "127.0.0.1", () => {
  console.log(`Isolated passkey API listening on 127.0.0.1:${port}`);
});
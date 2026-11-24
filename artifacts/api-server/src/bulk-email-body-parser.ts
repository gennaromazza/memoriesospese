import express from "express";

/**
 * The mass-email request contains the selected recipients and the email body.
 * Keep this larger limit scoped to the bulk-email API instead of increasing
 * the JSON limit for every endpoint.
 */
export function createBulkEmailJsonParser() {
  return express.json({ limit: "2mb" });
}

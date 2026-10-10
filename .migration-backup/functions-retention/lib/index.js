"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printShopRetentionHeartbeat = exports.resolveMaintenanceUrl = exports.isSuccessfulMaintenanceResult = exports.PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT = exports.PRINT_SHOP_MAINTENANCE_AUDIENCE = void 0;
const google_auth_library_1 = require("google-auth-library");
const firebase_functions_1 = require("firebase-functions");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const contract_js_1 = require("./contract.js");
var contract_js_2 = require("./contract.js");
Object.defineProperty(exports, "PRINT_SHOP_MAINTENANCE_AUDIENCE", { enumerable: true, get: function () { return contract_js_2.PRINT_SHOP_MAINTENANCE_AUDIENCE; } });
Object.defineProperty(exports, "PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT", { enumerable: true, get: function () { return contract_js_2.PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT; } });
Object.defineProperty(exports, "isSuccessfulMaintenanceResult", { enumerable: true, get: function () { return contract_js_2.isSuccessfulMaintenanceResult; } });
Object.defineProperty(exports, "resolveMaintenanceUrl", { enumerable: true, get: function () { return contract_js_2.resolveMaintenanceUrl; } });
/**
 * Sveglia giornalmente il deployment Autoscale e delega al backend la
 * manutenzione idempotente di Storage, ordini e cartelle laboratorio.
 * L'autenticazione usa un Google-signed ID token con audience esatta; non viene
 * condiviso alcun segreto statico tra Firebase e Replit.
 */
exports.printShopRetentionHeartbeat = (0, scheduler_1.onSchedule)({
    schedule: "15 3 * * *",
    timeZone: "Europe/Rome",
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "256MiB",
    serviceAccount: contract_js_1.PRINT_SHOP_MAINTENANCE_SERVICE_ACCOUNT,
    retryCount: 3,
    maxRetrySeconds: 3_600,
}, async () => {
    const maintenanceUrl = (0, contract_js_1.resolveMaintenanceUrl)();
    const auth = new google_auth_library_1.GoogleAuth();
    const client = await auth.getIdTokenClient(maintenanceUrl);
    const response = await client.request({
        url: maintenanceUrl,
        method: "POST",
        headers: {
            "content-type": "application/json",
            "user-agent": "firebase-print-shop-retention/3.0",
        },
        data: { source: "firebase-scheduler" },
        timeout: 8 * 60 * 1_000,
        maxRedirects: 0,
        validateStatus: () => true,
    });
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`Maintenance HTTP ${response.status}`);
    }
    if (!(0, contract_js_1.isSuccessfulMaintenanceResult)(response.data)) {
        // Replit can return the SPA shell with HTTP 200 for an unregistered API
        // route. Treat malformed bodies and {ok:false} as failures so Scheduler
        // retries rather than silently skipping the 90-day cleanup.
        throw new Error("Maintenance response non valida o non completata");
    }
    const result = response.data;
    firebase_functions_1.logger.info("Manutenzione shop stampe completata", {
        success: result?.ok === true,
        lifecycle: result?.lifecycle,
        cleanup: result?.cleanup,
        lab: result?.lab,
    });
});
//# sourceMappingURL=index.js.map
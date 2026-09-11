"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin = void 0;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
/**
 * Compatibility facade for the legacy Functions code while using the
 * modular Admin SDK API supported by current firebase-admin versions.
 */
exports.admin = {
    get apps() {
        return (0, app_1.getApps)();
    },
    initializeApp: app_1.initializeApp,
    auth: auth_1.getAuth,
    firestore: firestore_1.getFirestore,
};
//# sourceMappingURL=admin-compat.js.map
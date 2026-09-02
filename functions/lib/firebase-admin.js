"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.admin = exports.db = void 0;
/** Admin SDK condiviso per le Cloud Functions. */
const admin = require("firebase-admin");
exports.admin = admin;
if (!admin.apps.length) {
    admin.initializeApp();
}
exports.db = admin.firestore();
//# sourceMappingURL=firebase-admin.js.map
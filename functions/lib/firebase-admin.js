"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
/** Admin SDK condiviso per le Cloud Functions. */
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
if (!(0, app_1.getApps)().length) {
    (0, app_1.initializeApp)();
}
exports.db = (0, firestore_1.getFirestore)();
//# sourceMappingURL=firebase-admin.js.map
export { db } from "./firestore";
export const storage = {};
export const auth = { currentUser: { getIdToken: async () => "isolated-fixture-token" } };
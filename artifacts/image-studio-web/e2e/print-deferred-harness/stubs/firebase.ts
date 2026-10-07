export const auth = {
  currentUser: { uid: "fixture-user", email: "customer@example.test", displayName: "Fixture Customer", getIdToken: async () => "fixture-token" },
  authStateReady: async () => undefined,
};
export const db = {};
export const storage = {};
export const functions = {};
export function convertFirestoreTimestamp(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") return new Date(value);
  if (value.toDate) return value.toDate();
  if (value.seconds) return new Date(value.seconds * 1000);
  return null;
}
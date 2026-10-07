import React, { useMemo } from "react";
export function useStudio() {
  const params = new URLSearchParams(window.location.search);
  const phone = params.get("phone") ?? "+39 081 555 0101";
  const email = params.get("email") ?? "help@example.test";
  const studioSettings = useMemo(() => ({ name: "Studio Fixture", phone, email, address: "Via Fixture 1, Aversa" }), [phone, email]);
  return { studioSettings, loading: false };
}
export function StudioProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
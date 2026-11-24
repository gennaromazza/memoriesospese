import React, { useMemo } from "react";
export function useStudio() {
  const params = new URLSearchParams(window.location.search);
  const phone = params.get("phone") ?? "+39 081 555 0101";
  const email = params.get("email") ?? "help@example.test";
  const hasLegalFixture = params.has("legalFixture");
  const studioSettings = useMemo(() => ({
    name: "Studio Fixture",
    phone,
    email,
    address: "Via Fixture 1, Aversa",
    ...(hasLegalFixture ? {
      partitaIVA: "12345678901",
      fiscalVia: "Via Fixture 1",
      fiscalCap: "81031",
      fiscalComune: "Aversa",
      fiscalProvincia: "CE",
    } : {}),
  }), [phone, email, hasLegalFixture]);
  return { studioSettings, loading: false };
}
export function StudioProvider({ children }: { children: React.ReactNode }) { return <>{children}</>; }
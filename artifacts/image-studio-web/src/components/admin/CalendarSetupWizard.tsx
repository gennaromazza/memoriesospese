import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle, RefreshCw, X } from "lucide-react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";

export interface SetupStatus {
  connected: boolean;
  calendarId?: string | null;
  calendarName?: string;
  accountEmail?: string;
  error?: string;
  errorCode?: string;
}

interface SetupInfo {
  accountEmail: string;
  currentCalendarId: string | null;
  calendars: { id: string; summary: string; accessRole: string }[];
  discoveryError?: string;
}

function safeMessage(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const t = value.trim();
  if (!t || /<[a-z!/]/i.test(t) || t.length > 300) return fallback;
  return t;
}

async function call(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) throw new Error("Sessione admin non disponibile");
  const token = await user.getIdToken();
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = {};
  try {
    data = JSON.parse(await res.text());
  } catch {
    data = {};
  }
  return { ok: res.ok, status: res.status, data };
}

function normalize(data: any): SetupStatus {
  const err = data?.error;
  return {
    connected: !!data?.connected,
    calendarId: data?.calendarId ?? null,
    calendarName: typeof data?.calendarName === "string" ? data.calendarName : undefined,
    accountEmail: data?.accountEmail ?? data?.email,
    errorCode: typeof data?.errorCode === "string" ? data.errorCode : undefined,
    error: err
      ? safeMessage(typeof err === "string" ? err : err?.message, "Verifica non riuscita")
      : undefined,
  };
}

interface Props {
  onClose: () => void;
  onCompleted: (status: SetupStatus) => void;
}

export function CalendarSetupWizard({ onClose, onCompleted }: Props) {
  const [info, setInfo] = useState<SetupInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarId, setCalendarId] = useState("");
  const [verified, setVerified] = useState<SetupStatus | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"verify" | "confirm" | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await call("/api/calendar/setup");
      if (!r.ok) throw new Error();
      const d = r.data ?? {};
      const next: SetupInfo = {
        accountEmail: String(d.accountEmail ?? d.email ?? ""),
        currentCalendarId: typeof d.currentCalendarId === "string" && d.currentCalendarId ? d.currentCalendarId : null,
        calendars: Array.isArray(d.calendars) ? d.calendars.filter((c: any) => c && typeof c.id === "string") : [],
        discoveryError: d.discoveryError ? safeMessage(d.discoveryError, "Elenco calendari non disponibile") : undefined,
      };
      setInfo(next);
      if (next.currentCalendarId) setCalendarId(next.currentCalendarId);
    } catch {
      setLoadError("Impossibile caricare la configurazione del calendario.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const locked = !!info?.currentCalendarId;
  const trimmed = calendarId.trim();

  const changeInput = (v: string) => {
    if (locked) return;
    reqId.current++;
    setCalendarId(v);
    setVerified(null);
    setVerifyError(null);
    setConfirmed(false);
    setConfirmError(null);
    setBusy(null);
  };

  const verify = async () => {
    if (!trimmed) return;
    const id = ++reqId.current;
    setBusy("verify");
    setVerified(null);
    setVerifyError(null);
    setConfirmed(false);
    setConfirmError(null);
    try {
      const r = await call("/api/calendar/setup/verify", { calendarId: trimmed });
      if (id !== reqId.current) return;
      const s = normalize(r.data);
      if (!r.ok || !s.connected) {
        setVerifyError(s.error || "Il calendario non è accessibile in scrittura dal Service Account.");
      } else {
        setVerified(s);
        if (locked) onCompleted(s);
      }
    } catch {
      if (id === reqId.current) setVerifyError("Verifica non riuscita. Riprova.");
    } finally {
      if (id === reqId.current) setBusy(null);
    }
  };

  const confirm = async () => {
    if (!verified || !confirmed || locked) return;
    const id = reqId.current;
    setBusy("confirm");
    setConfirmError(null);
    try {
      const r = await call("/api/calendar/setup/confirm", { calendarId: trimmed, confirmed: true });
      if (id !== reqId.current) return;
      if (r.status === 409) {
        setConfirmError("Esiste già un calendario di destinazione diverso: non può essere sostituito da qui.");
        await load();
        return;
      }
      const s = normalize(r.data);
      if (!r.ok || !s.connected) {
        setConfirmError(s.error || "Salvataggio non riuscito. Riprova.");
        return;
      }
      onCompleted(s);
    } catch {
      if (id === reqId.current) setConfirmError("Salvataggio non riuscito. Riprova.");
    } finally {
      if (id === reqId.current) setBusy(null);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg border border-gray-200 space-y-4" data-testid="calendar-setup-wizard">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800">Configurazione guidata Google Calendar</p>
        <Button variant="ghost" size="sm" onClick={onClose} disabled={busy === "confirm"} aria-label="Chiudi" data-testid="button-close-wizard">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
          <div className="h-9 bg-gray-100 rounded animate-pulse" />
        </div>
      ) : loadError || !info ? (
        <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertCircle className="h-5 w-5 text-red-600" />
          <span className="text-sm text-red-700 flex-1">{loadError}</span>
          <Button variant="outline" size="sm" onClick={load} className="text-red-700">
            <RefreshCw className="mr-2 h-4 w-4" /> Riprova
          </Button>
        </div>
      ) : (
        <>
          {/* Step 1 */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">1. Scegli il calendario</p>
            {locked ? (
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800">
                Calendario di destinazione già configurato: <strong className="break-all">{info.currentCalendarId}</strong>.
                Non può essere sostituito da questa procedura; puoi solo verificarlo.
                <p className="mt-2">
                  In Google Calendar, nelle impostazioni di questo calendario, apri “Condividi con persone specifiche”
                  e aggiungi <strong className="break-all">{info.accountEmail}</strong> con il permesso
                  “Apportare modifiche agli eventi”, poi riprova la verifica.
                </p>
              </div>
            ) : (
              <>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-sm text-blue-800 space-y-1">
                  <p>In Google Calendar apri <strong>Impostazioni</strong> del calendario dello studio &gt; <strong>Integra calendario</strong> e copia l&apos;<strong>ID calendario</strong> (non l&apos;URL pubblico).</p>
                  <p>
                    In <strong>Condividi con persone specifiche</strong> aggiungi{" "}
                    <strong className="break-all">{info.accountEmail || "l'email del Service Account"}</strong> con il permesso
                    “Apportare modifiche agli eventi”.
                  </p>
                  <p className="text-xs text-blue-600">Non serve alcun login né credenziali: basta l&apos;ID del calendario.</p>
                </div>
                {info.discoveryError && (
                  <p className="text-xs text-amber-700">{info.discoveryError} Inserisci l&apos;ID manualmente.</p>
                )}
                {info.calendars.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Calendari visibili al Service Account (l&apos;elenco può essere incompleto):</p>
                    {info.calendars.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={busy === "confirm"}
                        onClick={() => changeInput(c.id)}
                        className={`w-full text-left p-2 rounded border text-sm ${
                          trimmed === c.id ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="font-medium text-gray-800">{c.summary || c.id}</span>
                        <span className="block text-xs text-gray-500 break-all">{c.id} · {c.accessRole}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  !info.discoveryError && (
                    <p className="text-xs text-gray-500">Nessun calendario condiviso rilevato: inserisci l&apos;ID manualmente.</p>
                  )
                )}
                <label className="block text-xs text-gray-600">
                  ID calendario
                  <input
                    value={calendarId}
                    disabled={busy === "confirm"}
                    onChange={(e) => changeInput(e.target.value)}
                    placeholder="es. xxxxxxxx@group.calendar.google.com"
                    className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    data-testid="input-calendar-id"
                  />
                </label>
              </>
            )}
          </section>

          {/* Step 2 */}
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">2. Verifica accesso</p>
            <Button variant="outline" size="sm" onClick={verify} disabled={!trimmed || busy !== null} data-testid="button-wizard-verify">
              <RefreshCw className={`mr-2 h-4 w-4 ${busy === "verify" ? "animate-spin" : ""}`} />
              {busy === "verify" ? "Verifica in corso..." : verifyError ? "Riprova verifica" : "Verifica calendario"}
            </Button>
            {verifyError && <p className="text-xs text-red-600">{verifyError}</p>}
            {verified && (
              <p className="flex items-center gap-1 text-xs text-green-700">
                <CheckCircle className="h-4 w-4" /> Lettura e scrittura verificate
                {verified.calendarName ? ` — ${verified.calendarName}` : ""}
              </p>
            )}
          </section>

          {/* Step 3 */}
          {!locked && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">3. Conferma e salva</p>
              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-800">
                Gli eventi già esistenti non verranno spostati né recuperati. Una volta salvato, il calendario di
                destinazione non potrà essere sostituito da questa procedura.
              </div>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={!verified || busy !== null}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-1"
                  data-testid="checkbox-confirm-calendar"
                />
                Confermo che questo è lo stesso calendario dello studio usato per i lavori esistenti.
              </label>
              <Button size="sm" onClick={confirm} disabled={!verified || !confirmed || busy !== null} data-testid="button-wizard-confirm">
                {busy === "confirm" ? "Salvataggio..." : confirmError ? "Riprova salvataggio" : "Salva calendario"}
              </Button>
              {confirmError && <p className="text-xs text-red-600">{confirmError}</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, RefreshCw } from "lucide-react";
import { auth } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

interface CalendarConnectionStatus {
  connected: boolean;
  accountEmail?: string;
  calendarId?: string;
  authMethod?: string;
  error?: string;
  loading: boolean;
}

function calendarErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string") {
      return typeof record.code === "string"
        ? `${record.code}: ${record.message}`
        : record.message;
    }
    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== "{}" ? serialized : "Errore verifica calendario";
    } catch {
      return "Errore verifica calendario";
    }
  }
  return String(error);
}

interface GoogleCalendarStatusProps {
  toast: ReturnType<typeof useToast>["toast"];
}

export function GoogleCalendarStatus({ toast }: GoogleCalendarStatusProps) {
  const [status, setStatus] = useState<CalendarConnectionStatus>({
    connected: false,
    loading: true,
  });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getFirebaseToken = async (forceRefresh = false) => {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken(forceRefresh);
  };

  const getResponseData = async (response: Response): Promise<any> => {
    const text = await response.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return { error: text };
    }
  };

  const responseError = (response: Response, data: any) =>
    calendarErrorMessage(data?.error) ||
    `${response.status}: ${response.statusText || "Richiesta non riuscita"}`;

  const checkStatus = async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    try {
      const token = await getFirebaseToken();
      if (!token) {
        setStatus({
          connected: false,
          loading: false,
          error: "Non autenticato",
        });
        return;
      }

      const response = await fetch("/api/calendar/connection-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await getResponseData(response);
      if (!response.ok) {
        throw new Error(responseError(response, data));
      }
      setStatus({
        ...data,
        loading: false,
        error: calendarErrorMessage(data?.error),
      });
    } catch (error: any) {
      setStatus({
        connected: false,
        loading: false,
        error: calendarErrorMessage(error) || "Errore verifica calendario",
      });
    }
  };

  const refreshCalendarConnection = async () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    try {
      await auth.authStateReady();
      const user = auth.currentUser;
      if (!user) {
        throw new Error("Sessione admin non disponibile");
      }

      let token = await user.getIdToken(true);
      let response = await fetch("/api/calendar/refresh-token", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      // Ritenta una volta se il token viene rifiutato mentre la sessione cambia.
      if (response.status === 401) {
        token = await user.getIdToken(true);
        response = await fetch("/api/calendar/refresh-token", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const data = await getResponseData(response);
      if (!response.ok) {
        throw new Error(responseError(response, data));
      }

      const refreshedStatus = data?.status;
      if (refreshedStatus && typeof refreshedStatus === "object") {
        setStatus({
          ...refreshedStatus,
          loading: false,
          error: calendarErrorMessage(refreshedStatus.error),
        });
      } else {
        await checkStatus();
      }

      if (refreshedStatus?.connected) {
        toast({
          title: "Google Calendar sincronizzato",
          description: "Sessione admin e connessione del Service Account verificate.",
        });
      } else {
        toast({
          title: "Connessione da verificare",
          description:
            calendarErrorMessage(refreshedStatus?.error) ||
            "Il Service Account non risulta collegato al calendario.",
          variant: "destructive",
        });
      }
    } catch (error) {
      const message =
        calendarErrorMessage(error) || "Impossibile sincronizzare Google Calendar";
      setStatus((prev) => ({
        ...prev,
        loading: false,
        error: message,
      }));
      toast({
        title: "Sincronizzazione non riuscita",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (status.loading) {
    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
        <RefreshCw className="h-5 w-5 text-gray-400 animate-spin" />
        <span className="text-sm text-gray-600">
          Verifica connessione in corso...
        </span>
      </div>
    );
  }

  if (status.connected) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <span className="text-sm text-green-800">
                Service Account: <strong>{status.accountEmail}</strong>
              </span>
              <p className="text-xs text-green-600">
                Calendario: {status.calendarId} — Connessione permanente
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshCalendarConnection}
            disabled={isRefreshing}
            className="text-green-700 hover:text-green-800"
            data-testid="button-sync-calendar"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Sincronizzazione..." : "Sincronizza / ricollega"}
          </Button>
        </div>
        <CalendarConnectionHelp />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-5 w-5 text-red-600" />
        <div className="flex-1">
          <span className="text-sm text-red-800 font-medium">
            Google Calendar non connesso
          </span>
          {status.error && (
            <p className="text-xs text-red-600 mt-1">{status.error}</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshCalendarConnection}
          disabled={isRefreshing}
          className="text-red-700"
          data-testid="button-sync-calendar"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Sincronizzazione..." : "Sincronizza / ricollega"}
        </Button>
      </div>

      <CalendarConnectionHelp />
    </div>
  );
}

function CalendarConnectionHelp() {
  return (
    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
      <p className="text-sm text-blue-800 mb-2">
        <strong>Come funziona il collegamento:</strong>
      </p>
      <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
        <li>
          Il pulsante rinnova la sessione Firebase dell&apos;admin e verifica di
          nuovo la richiesta.
        </li>
        <li>
          Il server reinizializza il client Google con il Service Account
          configurato; non è un nuovo login OAuth personale.
        </li>
        <li>
          Se l&apos;errore continua, il calendario deve essere condiviso con
          l&apos;indirizzo email del Service Account.
        </li>
      </ul>
    </div>
  );
}

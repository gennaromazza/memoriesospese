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

interface GoogleCalendarStatusProps {
  toast: ReturnType<typeof useToast>["toast"];
}

export function GoogleCalendarStatus({ toast }: GoogleCalendarStatusProps) {
  const [status, setStatus] = useState<CalendarConnectionStatus>({
    connected: false,
    loading: true,
  });

  const checkStatus = async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    try {
      const token = await auth.currentUser?.getIdToken();
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
      const data = await response.json();
      setStatus({ ...data, loading: false });
    } catch (error: any) {
      setStatus({ connected: false, loading: false, error: error.message });
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
            variant="ghost"
            size="sm"
            onClick={checkStatus}
            className="text-green-700 hover:text-green-800"
            data-testid="button-refresh-calendar"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
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
          variant="ghost"
          size="sm"
          onClick={checkStatus}
          className="text-red-700"
          data-testid="button-retry-calendar"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
        <p className="text-sm text-blue-800 mb-2">
          <strong>Per connettere Google Calendar:</strong>
        </p>
        <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
          <li>Vai nella sezione "Deployments" del tuo progetto Replit</li>
          <li>Clicca su "Integrations"</li>
          <li>Trova "Google Calendar" e clicca "Connect"</li>
          <li>Autorizza l'accesso con l'account desiderato</li>
        </ol>
      </div>
    </div>
  );
}

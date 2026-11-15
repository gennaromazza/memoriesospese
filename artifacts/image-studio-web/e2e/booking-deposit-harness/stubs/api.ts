type HarnessState = {
  scenario: string;
  calls: Array<{ name: string; detail?: unknown }>;
  hold: Record<string, any> | null;
  payment: Record<string, any> | null;
  released: boolean;
  resolveCapture: boolean;
};

declare global {
  interface Window {
    __bookingPaymentHarness?: HarnessState;
  }
}

const key = "booking-deposit-browser-harness";
const now = () => new Date();
function state(): HarnessState {
  if (!window.__bookingPaymentHarness) {
    const saved = window.localStorage.getItem(key);
    window.__bookingPaymentHarness = saved ? JSON.parse(saved) : {
      scenario: "success", calls: [], hold: null, payment: null, released: false, resolveCapture: false,
    };
  }
  return window.__bookingPaymentHarness;
}
function save(value = state()) {
  window.__bookingPaymentHarness = value;
  window.localStorage.setItem(key, JSON.stringify(value));
}
function record(name: string, detail?: unknown) {
  const value = state();
  value.calls.push({ name, detail });
  save(value);
}
function payment(value: HarnessState) {
  return value.payment ?? {
    bookingId: "booking-browser-test",
    paypalOrderId: "ORDER-BROWSER-TEST",
    paypalCaptureId: "CAPTURE-BROWSER-TEST",
    amountCents: 2500,
    currency: "EUR",
    status: "paid",
    bookingConfirmed: true,
    duplicate: false,
  };
}

export async function getBookingPayPalConfig() {
  record("paypal-config");
  return { enabled: true, clientId: "simulated-client", currency: "EUR", environment: "sandbox" };
}

export async function createBookingCheckoutHold(input: Record<string, unknown>) {
  record("create-hold", input);
  const value = state();
  const serverTime = now();
  const expiresAt = value.scenario === "expired" ? serverTime : new Date(serverTime.getTime() + 10 * 60_000);
  value.hold = {
    bookingId: "booking-browser-test",
    campaignId: "campaign-browser-test",
    flow: "immediate",
    status: "active",
    depositAmountCents: 2500,
    currency: "EUR",
    expiresAt: expiresAt.toISOString(),
    serverTime: serverTime.toISOString(),
    dataShootingInizio: "2030-12-01T09:00:00.000Z",
    dataShootingFine: "2030-12-01T09:30:00.000Z",
    token: "a".repeat(64),
  };
  save(value);
  return value.hold;
}

export async function resumeBookingCheckoutHold(bookingId: string) {
  record("resume-hold", { bookingId });
  const value = state();
  if (!value.hold) throw Object.assign(new Error("Checkout non trovato"), { status: 404 });
  return value.hold;
}

export async function releaseBookingCheckoutHold(bookingId: string) {
  record("release-hold", { bookingId });
  const value = state();
  value.released = true;
  save(value);
  return { bookingId, status: "cancelled" };
}

export async function createBookingDepositOrder(bookingId: string) {
  record("create-order", { bookingId, amountCents: 2500 });
  return {
    bookingId,
    paypalOrderId: "ORDER-BROWSER-TEST",
    depositAmountCents: 2500,
    currency: "EUR",
  };
}

export async function captureBookingDeposit(bookingId: string) {
  record("capture", { bookingId });
  const value = state();
  if (value.scenario === "uncertain") {
    value.payment = payment(value);
    save(value);
    throw new Error("Risposta di rete interrotta dopo la cattura simulata");
  }
  if (value.scenario === "late") {
    value.payment = {
      ...payment(value),
      status: "paid_action_required",
      bookingConfirmed: false,
    };
    save(value);
    return value.payment;
  }
  value.payment = payment(value);
  save(value);
  return value.payment;
}

export async function getBookingDepositStatus(bookingId: string) {
  record("payment-status", { bookingId });
  const value = state();
  if (value.scenario === "uncertain" && value.payment && !value.resolveCapture) {
    return { bookingId, status: "processing" };
  }
  if (value.payment && (value.scenario !== "uncertain" || value.resolveCapture)) {
    return {
      bookingId,
      campaignId: "campaign-browser-test",
      flow: "immediate",
      status: value.payment.status,
      payment: value.payment,
      dataShootingInizio: value.hold?.dataShootingInizio || "2030-12-01T09:00:00.000Z",
      dataShootingFine: value.hold?.dataShootingFine || "2030-12-01T09:30:00.000Z",
    };
  }
  return {
    bookingId,
    campaignId: "campaign-browser-test",
    flow: "immediate",
    status: "unpaid",
    dataShootingInizio: value.hold?.dataShootingInizio || "2030-12-01T09:00:00.000Z",
    dataShootingFine: value.hold?.dataShootingFine || "2030-12-01T09:30:00.000Z",
  };
}


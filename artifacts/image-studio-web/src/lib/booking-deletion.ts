export function requiresBookingCancellationPanel(source: {
  acconto?: unknown; depositPayment?: unknown; depositPaymentRequest?: unknown; stato?: unknown;
  customerReschedule?: { status?: string } | null; bookingCancellation?: { status?: string } | null;
}): boolean {
  return !!source.depositPayment || !!source.depositPaymentRequest || Number(source.acconto || 0) > 0 || source.stato === 'cancellation_pending'
    || ['pending', 'blocked'].includes(source.customerReschedule?.status || '')
    || ['pending', 'working', 'blocked'].includes(source.bookingCancellation?.status || '');
}

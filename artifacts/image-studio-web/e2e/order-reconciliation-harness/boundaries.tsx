import { useState } from 'react';
import { Timestamp } from './firestore';
import { apiRequest } from './query-client';

const forbidden = async () => { throw new Error('Provider disabilitato nel test'); };
const empty = async () => [];
// Acconto PayPal già incassato sulla prenotazione: l'ordine va verificato (copiato) in background.
const params = new URLSearchParams(window.location.search);
const approvalCase = params.get('approval-case');
const bookingStorageKey = 'order-reconciliation-booking-fixture';
const initialBooking = { id: 'booking', campaignId: 'campaign', stato: approvalCase ? 'in_attesa' : 'confermata', isViewed: true,
  depositPayment: approvalCase ? undefined : { provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 500, paypalCaptureId: 'CAPTURE' },
  cliente: { nome: 'Cliente', cognome: 'Fittizio', email: 'cliente@example.test', whatsapp: '' },
  dataShootingInizio: Timestamp.fromDate(new Date('2030-12-01T10:00:00Z')),
  dataShootingFine: Timestamp.fromDate(new Date('2030-12-01T10:30:00Z')),
  createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
export function readBooking() {
  const saved = localStorage.getItem(bookingStorageKey);
  return saved ? JSON.parse(saved) : initialBooking;
}
export function saveBooking(booking: unknown) {
  const snapshot = booking as Record<string, any>;
  const serializeDate = (value: any) => typeof value?.millis === 'number'
    ? new Date(value.millis).toISOString() : value;
  localStorage.setItem(bookingStorageKey, JSON.stringify({
    ...snapshot,
    dataShootingInizio: serializeDate(snapshot.dataShootingInizio),
    dataShootingFine: serializeDate(snapshot.dataShootingFine),
  }));
}
let releaseDelayedListener: (() => void) | null = null;
let delayedListenerPending = false;
let listenerDelayUsed = false;
const user = { uid: 'fixture-admin', email: 'admin@example.test' };
export const useFirebaseAuth = () => ({ user });
export const useLiveBookings = () => {
  const [bookings, setBookings] = useState(() => [readBooking()]);
  return { data: bookings, isLoading: false,
    refetch: approvalCase ? () => {
      if (params.get('listener-delay') === '1' && !listenerDelayUsed) {
        listenerDelayUsed = true;
        delayedListenerPending = true;
        return new Promise<void>(resolve => {
          releaseDelayedListener = () => {
            setBookings([readBooking()]);
            delayedListenerPending = false;
            releaseDelayedListener = null;
            resolve();
          };
        });
      }
      setBookings([readBooking()]);
      return Promise.resolve();
    } : empty, liveError: null };
};
export function releaseBookingListener() {
  releaseDelayedListener?.();
}
export function isBookingListenerPending() {
  return delayedListenerPending;
}
export const useToast = () => ({ toast: () => undefined });
export const getAllCampaigns = async () => [{ id: 'campaign', nome: 'Campagna fittizia', attiva: true,
  richiedeAcconto: approvalCase === 'deposit', richiedeApprovazione: true }];
export const getActiveProducts = empty, getActiveProductCategories = empty;
export const GalleryService = { getAllGalleries: empty };
export const getClienteByEmail = async () => null;
export const recomputeJobAggregates = forbidden;
export async function approveBooking(id: string) {
  if (!approvalCase) return forbidden();
  return (await apiRequest('PATCH', `/api/booking/v2/${id}/approve`)).json();
}
export const markBookingAsViewed = () => new Promise<void>(() => {});
export const rejectBooking = forbidden, updateBookingStatus = forbidden;
export const deleteBooking = forbidden, updateBooking = forbidden;
export const getBookingById = forbidden, countRelatedEntities = forbidden, deleteBookingCascade = forbidden;
export const updateWorkflowState = forbidden, getWorkflowStateAfterOrderCreation = forbidden;
const Inert = () => null;
export const BookingPaymentPanel = Inert, BookingApprovalButton = Inert, BookingManagementLinkPanel = Inert;
export const BookingCancellationAdminPanel = Inert, BookingPaymentCheckouts = Inert, InPersonDepositDialog = Inert;
export default Inert;

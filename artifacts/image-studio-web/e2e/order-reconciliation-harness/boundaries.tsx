import { Timestamp } from './firestore';

const forbidden = async () => { throw new Error('Provider disabilitato nel test'); };
const empty = async () => [];
// Acconto PayPal già incassato sulla prenotazione: l'ordine va verificato (copiato) in background.
const booking = { id: 'booking', campaignId: 'campaign', stato: 'confermata', isViewed: true,
  depositPayment: { provider: 'paypal', status: 'paid', currency: 'EUR', amountCents: 500, paypalCaptureId: 'CAPTURE' },
  cliente: { nome: 'Cliente', cognome: 'Fittizio', email: 'cliente@example.test', whatsapp: '' },
  dataShootingInizio: Timestamp.fromDate(new Date('2030-12-01T10:00:00Z')),
  dataShootingFine: Timestamp.fromDate(new Date('2030-12-01T10:30:00Z')),
  createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
const bookings = [booking];
const user = { uid: 'fixture-admin', email: 'admin@example.test' };
export const useFirebaseAuth = () => ({ user });
export const useLiveBookings = () => ({ data: bookings, isLoading: false, refetch: empty, liveError: null });
export const useToast = () => ({ toast: () => undefined });
export const getAllCampaigns = async () => [{ id: 'campaign', nome: 'Campagna fittizia', attiva: true }];
export const getActiveProducts = empty, getActiveProductCategories = empty;
export const GalleryService = { getAllGalleries: empty };
export const getClienteByEmail = async () => null;
export const recomputeJobAggregates = forbidden;
export const approveBooking = forbidden, rejectBooking = forbidden, updateBookingStatus = forbidden;
export const deleteBooking = forbidden, markBookingAsViewed = forbidden, updateBooking = forbidden;
export const getBookingById = forbidden, countRelatedEntities = forbidden, deleteBookingCascade = forbidden;
export const updateWorkflowState = forbidden, getWorkflowStateAfterOrderCreation = forbidden;
const Inert = () => null;
export const BookingPaymentPanel = Inert, BookingApprovalButton = Inert, BookingManagementLinkPanel = Inert;
export const BookingCancellationAdminPanel = Inert, BookingPaymentCheckouts = Inert;
export default Inert;

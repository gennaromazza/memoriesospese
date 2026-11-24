import { depositReceiptReference } from '@shared/booking-deposit-receipt';
import type { Booking } from '@shared/booking-types';
import { Badge } from '@/components/ui/badge';

type BookingDepositStatus = Pick<Booking, 'depositPayment' | 'depositWaiver'>;

export function bookingDepositStatusLabel(booking: BookingDepositStatus): string | null {
  const payment = booking.depositPayment;
  if (payment?.status === 'paid' && depositReceiptReference(payment)) {
    return payment.provider === 'in_person' ? 'Acconto incassato in studio' : 'Acconto pagato online';
  }
  if (booking.depositWaiver) return 'Acconto da pagare in studio';
  return null;
}

export function BookingDepositStatusBadge({ booking }: { booking: BookingDepositStatus }) {
  const label = bookingDepositStatusLabel(booking);
  if (!label) return null;

  const isPaid = label !== 'Acconto da pagare in studio';
  return (
    <Badge
      variant="outline"
      className={isPaid
        ? 'whitespace-normal border-green-200 bg-green-50 text-green-800'
        : 'whitespace-normal border-amber-300 bg-amber-50 text-amber-900'}
      title={isPaid
        ? 'Incasso registrato con ricevuta.'
        : 'Esonero dalla richiesta PayPal. Non è stato registrato alcun incasso.'}
      data-testid="booking-deposit-status"
    >
      {label}
    </Badge>
  );
}

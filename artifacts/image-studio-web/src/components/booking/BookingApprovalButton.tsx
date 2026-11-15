import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';

interface BookingApprovalButtonProps {
  bookingId: string;
  requiresDeposit: boolean;
  placement: 'list' | 'detail';
  isPending: boolean;
  isDisabled?: boolean;
  onApprove: () => void;
}

export function BookingApprovalButton({
  bookingId,
  requiresDeposit,
  placement,
  isPending,
  isDisabled = false,
  onApprove,
}: BookingApprovalButtonProps) {
  const label = requiresDeposit
    ? 'Approva e richiedi acconto'
    : placement === 'detail' ? 'Approva Ora' : 'Approva';

  if (placement === 'list') {
    return (
      <Button
        size="sm"
        onClick={onApprove}
        disabled={isPending || isDisabled}
        className="bg-sage hover:bg-dark-sage h-auto min-h-12 whitespace-normal"
        data-testid={`button-approve-${bookingId}`}
      >
        {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
        {label}
      </Button>
    );
  }

  return (
    <Button
      onClick={onApprove}
      disabled={isPending || isDisabled}
      className="bg-sage hover:bg-dark-sage"
      data-testid={`button-approve-detail-${bookingId}`}
    >
      {isPending
        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approvazione...</>
        : <><CheckCircle className="w-4 h-4 mr-2" />{label}</>}
    </Button>
  );
}

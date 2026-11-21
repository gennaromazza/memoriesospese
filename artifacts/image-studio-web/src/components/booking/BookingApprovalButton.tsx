import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';

interface BookingApprovalButtonProps {
  bookingId: string;
  requiresDeposit: boolean;
  placement: 'list' | 'detail';
  isPending: boolean;
  isDisabled?: boolean;
  onApprove: () => void;
  completedLabel?: string;
}

export function BookingApprovalButton({
  bookingId,
  requiresDeposit,
  placement,
  isPending,
  isDisabled = false,
  onApprove,
  completedLabel,
}: BookingApprovalButtonProps) {
  const label = requiresDeposit
    ? 'Approva e richiedi acconto'
    : placement === 'detail' ? 'Approva Ora' : 'Approva';

  if (placement === 'list') {
    return (
      <Button
        type="button"
        size="sm"
        onClick={onApprove}
        disabled={isPending || isDisabled || !!completedLabel}
        className="bg-sage hover:bg-dark-sage h-auto min-h-12 whitespace-normal"
        data-testid={`button-approve-${bookingId}`}
      >
        {isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
        {completedLabel || label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      onClick={onApprove}
      disabled={isPending || isDisabled || !!completedLabel}
      className="bg-sage hover:bg-dark-sage"
      data-testid={`button-approve-detail-${bookingId}`}
    >
      {completedLabel ? <><CheckCircle className="w-4 h-4 mr-2" />{completedLabel}</> : isPending
        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approvazione...</>
        : <><CheckCircle className="w-4 h-4 mr-2" />{label}</>}
    </Button>
  );
}

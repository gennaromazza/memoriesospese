interface PrintShopCouponFeedbackProps {
  message: string;
  isError: boolean;
}

export function PrintShopCouponFeedback({ message, isError }: PrintShopCouponFeedbackProps) {
  if (!message) return null;

  return (
    <p
      className={`mt-2 text-sm ${isError ? 'text-red-700' : 'text-emerald-800'}`}
      role={isError ? 'alert' : 'status'}
    >
      {message}
    </p>
  );
}

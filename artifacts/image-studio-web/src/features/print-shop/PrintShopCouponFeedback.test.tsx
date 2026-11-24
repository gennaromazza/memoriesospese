import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PrintShopCouponFeedback } from './PrintShopCouponFeedback';

describe('print shop coupon feedback', () => {
  it('announces a rejected coupon as an accessible visible error', () => {
    const html = renderToStaticMarkup(
      <PrintShopCouponFeedback message="Il codice coupon non è valido" isError />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Il codice coupon non è valido');
  });

  it('announces a successfully applied coupon as a status', () => {
    const html = renderToStaticMarkup(
      <PrintShopCouponFeedback message="Coupon SAVE10 applicato." isError={false} />,
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('Coupon SAVE10 applicato.');
  });
});

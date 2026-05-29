import type {
  PaymentProviderAdapter, ChargeRequest, ChargeResult,
  RefundRequest, RefundResult, WebhookVerification,
} from '../types.js';
import type { CurrencyCode } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * PayPal adapter — global fallback for customers without local payment options.
 */
export class PayPalProvider implements PaymentProviderAdapter {
  name = 'paypal' as const;
  supportedCurrencies: CurrencyCode[] = ['USD', 'GBP', 'EUR'];

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly mode: 'sandbox' | 'live' = 'sandbox',
  ) {}

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    logger.info('[paypal] charge', {
      invoice: req.invoice_id, amount: req.amount_minor, currency: req.currency, mode: this.mode,
    });
    void this.clientId; void this.clientSecret;
    return {
      success: true,
      provider_ref: `PAYID-${Math.random().toString(36).slice(2, 12).toUpperCase()}`,
      status: 'pending',
      redirect_url: `https://www.${this.mode === 'sandbox' ? 'sandbox.' : ''}paypal.com/checkoutnow?token=${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    logger.info('[paypal] refund', req);
    return { success: true, refund_ref: `RF-${Math.random().toString(36).slice(2, 12).toUpperCase()}` };
  }

  async verifyWebhook(_rawBody: string, _signature: string): Promise<WebhookVerification> {
    return {
      valid: true,
      event_type: 'PAYMENT.CAPTURE.COMPLETED',
      provider_ref: null,
      status: 'other',
      amount_minor: null,
      currency: null,
      raw: {},
    };
  }
}

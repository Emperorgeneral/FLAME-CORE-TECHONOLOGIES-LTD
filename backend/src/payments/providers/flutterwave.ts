import type {
  PaymentProviderAdapter, ChargeRequest, ChargeResult,
  RefundRequest, RefundResult, WebhookVerification,
} from '../types.js';
import type { CurrencyCode } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Flutterwave adapter — broad African coverage + USD/EUR/GBP.
 */
export class FlutterwaveProvider implements PaymentProviderAdapter {
  name = 'flutterwave' as const;
  supportedCurrencies: CurrencyCode[] = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'GBP', 'EUR'];

  constructor(private readonly secretKey: string, private readonly secretHash: string) {}

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    logger.info('[flutterwave] charge', {
      invoice: req.invoice_id, amount: req.amount_minor, currency: req.currency,
    });

    // Production: POST https://api.flutterwave.com/v3/payments
    void this.secretKey;
    return {
      success: true,
      provider_ref: `flw_${Math.random().toString(36).slice(2, 16)}`,
      status: 'pending',
      redirect_url: `https://checkout.flutterwave.com/${Math.random().toString(36).slice(2, 10)}`,
    };
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    logger.info('[flutterwave] refund', req);
    return { success: true, refund_ref: `flw_rf_${Math.random().toString(36).slice(2, 16)}` };
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<WebhookVerification> {
    // Flutterwave uses a static "verif-hash" header set in the dashboard.
    const valid = signature === this.secretHash;

    let parsed: any = {};
    try { parsed = JSON.parse(rawBody); } catch { /* ignore */ }

    const status =
      parsed?.data?.status === 'successful' ? 'paid' :
      parsed?.data?.status === 'failed'     ? 'failed' :
      'other';

    return {
      valid,
      event_type: parsed?.event ?? 'unknown',
      provider_ref: parsed?.data?.tx_ref ?? null,
      status,
      amount_minor: parsed?.data?.amount ? Math.round(parsed.data.amount * 100) : null,
      currency: parsed?.data?.currency ?? null,
      raw: parsed,
    };
  }
}

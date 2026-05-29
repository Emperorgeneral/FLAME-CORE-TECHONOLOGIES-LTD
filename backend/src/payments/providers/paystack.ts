import axios from 'axios';
import crypto from 'crypto';
import type {
  PaymentProviderAdapter, ChargeRequest, ChargeResult,
  RefundRequest, RefundResult, WebhookVerification,
} from '../types.js';
import type { CurrencyCode } from '../../types/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Paystack adapter — for Africa (NGN, GHS, ZAR, KES) and USD via international plan.
 */
export class PaystackProvider implements PaymentProviderAdapter {
  name = 'paystack' as const;
  supportedCurrencies: CurrencyCode[] = ['NGN', 'GHS', 'ZAR', 'KES', 'USD'];

  private readonly baseURL = 'https://api.paystack.co';

  constructor(private readonly secretKey: string) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    try {
      const { data } = await axios.post(
        `${this.baseURL}/transaction/initialize`,
        {
          email: req.customer_email,
          amount: req.amount_minor,
          currency: req.currency,
          callback_url: req.return_url,
          metadata: {
            team_id: req.team_id,
            invoice_id: req.invoice_id,
            ...(req.metadata || {}),
          },
        },
        { headers: this.headers }
      );

      if (!data?.status) throw new Error(data?.message || 'Paystack initialize failed');

      return {
        success: true,
        provider_ref: data.data.reference,
        status: 'pending',
        redirect_url: data.data.authorization_url,
      };
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message;
      logger.error('[paystack] charge failed', { invoice: req.invoice_id, error: msg });
      return { success: false, provider_ref: null, status: 'failed', error: msg };
    }
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    try {
      const { data } = await axios.post(
        `${this.baseURL}/refund`,
        { transaction: req.provider_ref, amount: req.amount_minor },
        { headers: this.headers }
      );
      return { success: !!data?.status, refund_ref: data?.data?.id ? String(data.data.id) : null };
    } catch (err: any) {
      return { success: false, refund_ref: null, error: err.message };
    }
  }

  async verifyWebhook(rawBody: string, signature: string): Promise<WebhookVerification> {
    const expected = crypto.createHmac('sha512', this.secretKey).update(rawBody).digest('hex');
    const valid = signature === expected;

    let parsed: any = {};
    try { parsed = JSON.parse(rawBody); } catch {}

    const event = parsed?.event;
    let status: WebhookVerification['status'] = 'other';
    if (event === 'charge.success') status = 'paid';
    else if (event === 'charge.failed') status = 'failed';
    else if (event?.includes('refund')) status = 'refunded';

    return {
      valid,
      event_type: event || 'unknown',
      provider_ref: parsed?.data?.reference ?? null,
      status,
      amount_minor: parsed?.data?.amount ?? null,
      currency: (parsed?.data?.currency as any) ?? null,
      raw: parsed,
    };
  }
}

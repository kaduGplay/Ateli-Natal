import type { PaymentStatus } from '../../shared/types.js';
import { HttpError } from '../errors.js';
import type { PaymentProvider, PixChargeResult } from './types.js';

/** Substituir pela VoidPay quando as credenciais e o contrato da API forem fornecidos. */
export class PendingPaymentProvider implements PaymentProvider {
  async createPixCharge(): Promise<PixChargeResult> {
    throw new HttpError(503, 'O pagamento Pix está temporariamente indisponível. Tente novamente mais tarde.');
  }

  async getPaymentStatus(): Promise<PaymentStatus> {
    throw new HttpError(503, 'A consulta de pagamento está temporariamente indisponível.');
  }
}

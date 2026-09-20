import type { PaymentStatus } from '../../shared/types.js';
import type { PaymentProvider, PixChargeInput, PixChargeResult } from './types.js';

/**
 * Gateway de DESENVOLVIMENTO: não cobra ninguém. Gera um código que NÃO é pagável e permite marcar
 * cobranças como pagas via `POST /api/dev/orders/:id/pay` (desativado em produção).
 * Substitua por uma implementação real de `PaymentProvider`.
 */
export class DevPaymentProvider implements PaymentProvider {
  private readonly paid = new Set<string>();

  async createPixCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const providerRef = `dev_${input.orderId}`;
    const copyPaste = `DEV-PIX-NAO-PAGAVEL|${input.orderId}|${input.amount.toFixed(2)}`;
    return { copyPaste, providerRef };
  }

  async getPaymentStatus(providerRef: string): Promise<PaymentStatus> {
    return this.paid.has(providerRef) ? 'paid' : 'pending';
  }

  markPaid(providerRef: string): void {
    this.paid.add(providerRef);
  }
}

import type { CustomerInfo, PaymentStatus, ShippingOption, TrackingPackage } from '../../shared/types.js';

/**
 * PONTOS DE INTEGRAÇÃO
 *
 * Pagamento, frete e rastreio são responsabilidades do dono da loja. Implemente estas interfaces
 * com o gateway/transportadora escolhidos e troque a instância em `providers/index.ts`.
 */

export interface PixChargeInput {
  orderId: string;
  /** Valor em reais já com desconto do Pix. */
  amount: number;
  customer: CustomerInfo;
  expiresAt: Date;
}

export interface PixChargeResult {
  provider?: 'voidpay' | 'dev';
  expiresAt?: string;
  webhookToken?: string;
  /** Código "copia e cola" (EMV) que o cliente paga no app do banco. */
  copyPaste: string;
  /** Identificador da cobrança no gateway (usado para consultar o status). */
  providerRef: string;
}

export interface PaymentProvider {
  createPixCharge(input: PixChargeInput): Promise<PixChargeResult>;
  getPaymentStatus(providerRef: string): Promise<PaymentStatus>;
}

export interface ShippingQuoteInput {
  cep: string;
  subtotal: number;
}

export interface ShippingProvider {
  quote(input: ShippingQuoteInput): Promise<ShippingOption[]>;
}

export interface TrackingProvider {
  /** `query` pode ser código de rastreio, número do pedido ou CPF. */
  lookup(query: string): Promise<TrackingPackage[]>;
}

import { VizzionPayPaymentProvider } from './payment.vizzionpay.js';
import { DevPaymentProvider } from './payment.dev.js';
import { VoidPayPaymentProvider } from './payment.voidpay.js';
import { TableShippingProvider } from './shipping.table.js';
import { OrderTrackingProvider } from './tracking.orders.js';
import type { PaymentProvider, ShippingProvider, TrackingProvider } from './types.js';

/** Troque estas instâncias pelas suas integrações reais. */
export const devPayment = new DevPaymentProvider();
const voidpay = new VoidPayPaymentProvider();
const vizzionpay = new VizzionPayPaymentProvider();
export const activePaymentProviderName = (): 'vizzionpay' | 'voidpay' => process.env.PAYMENT_PROVIDER === 'vizzionpay' ? 'vizzionpay' : 'voidpay';
export function getPaymentProvider(name: string = activePaymentProviderName()): PaymentProvider {
  return name === 'vizzionpay' ? vizzionpay : name === 'dev' ? devPayment : voidpay;
}
export const payment: PaymentProvider = {
  createPixCharge: input => getPaymentProvider().createPixCharge(input),
  getPaymentStatus: ref => getPaymentProvider().getPaymentStatus(ref),
};
export const shipping: ShippingProvider = new TableShippingProvider();
export const tracking: TrackingProvider = new OrderTrackingProvider();

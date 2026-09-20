import { DevPaymentProvider } from './payment.dev.js';
import { VoidPayPaymentProvider } from './payment.voidpay.js';
import { TableShippingProvider } from './shipping.table.js';
import { OrderTrackingProvider } from './tracking.orders.js';
import type { PaymentProvider, ShippingProvider, TrackingProvider } from './types.js';

/** Troque estas instâncias pelas suas integrações reais. */
export const devPayment = new DevPaymentProvider();
export const payment: PaymentProvider = new VoidPayPaymentProvider();
export const shipping: ShippingProvider = new TableShippingProvider();
export const tracking: TrackingProvider = new OrderTrackingProvider();

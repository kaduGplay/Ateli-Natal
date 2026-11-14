import { createHmac, timingSafeEqual } from 'node:crypto';
export interface VizzionPayCallbackAuth { orderId?: string; signature?: string }
const digest = (orderId: string, secret: string): string => createHmac('sha256', secret).update(`vizzionpay:callback:v1:${orderId}`).digest('hex');
export function signVizzionPayCallback(url: URL, orderId: string): void {
  const secret = process.env.VIZZIONPAY_CALLBACK_SECRET;
  if (!secret) return;
  url.searchParams.set('orderId', orderId);
  url.searchParams.set('signature', digest(orderId, secret));
}
export function validVizzionPayCallback(auth?: VizzionPayCallbackAuth): boolean {
  const secret = process.env.VIZZIONPAY_CALLBACK_SECRET;
  if (!secret || !auth?.orderId || auth.orderId.length > 100 || !/^[a-f0-9]{64}$/.test(auth.signature || '')) return false;
  return timingSafeEqual(Buffer.from(auth.signature!, 'hex'), Buffer.from(digest(auth.orderId, secret), 'hex'));
}

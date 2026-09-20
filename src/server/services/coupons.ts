import type { AppliedCoupon, Coupon } from '../../shared/types.js';
import { HttpError } from '../errors.js';
import { readJson } from '../storage.js';

export async function findCoupon(code: string): Promise<AppliedCoupon> {
  const normalized = code.trim().toUpperCase();
  const coupons = await readJson<Coupon[]>('coupons', []);
  const coupon = coupons.find((c) => c.active && c.code === normalized);
  if (!coupon) throw new HttpError(404, 'Cupom inválido ou não encontrado.');
  return { code: coupon.code, type: coupon.type, value: coupon.value };
}

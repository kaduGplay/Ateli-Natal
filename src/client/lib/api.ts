import type {
  ApiResponse,
  AppliedCoupon,
  Banner,
  Category,
  CheckoutRequest,
  CheckoutResponse,
  OrderStatusResponse,
  OrderPaymentResponse,
  Product,
  ReviewSummary,
  Review,
  ReviewsResponse,
  ShippingOption,
  StoreSettings,
  TrackingPackage,
} from '../../shared/types';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiError('Erro de conexão. Tente novamente.');
  }
  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!body) throw new ApiError('Resposta inválida do servidor.');
  if (!body.ok) throw new ApiError(body.message, res.status);
  return body.data;
}

const post = <T>(path: string, payload: unknown, signal?: AbortSignal): Promise<T> =>
  request<T>(path, { method: 'POST', body: JSON.stringify(payload), signal });

export const api = {
  products: () => request<Product[]>('/products'),
  categories: () => request<Category[]>('/categories'),
  banners: () => request<Banner[]>('/banners'),
  settings: () => request<StoreSettings>('/settings'),
  reviewSummaries: () => request<Record<string, ReviewSummary>>('/reviews/summary'),
  reviews: (productId: string) => request<ReviewsResponse>(`/products/${encodeURIComponent(productId)}/reviews`),
  postReview: (productId: string, input: { orderId: string; email: string; rating: number; title?: string; text: string }) =>
    post<Review>(`/products/${encodeURIComponent(productId)}/reviews`, input),
  shippingQuote: (cep: string, subtotal: number) => post<ShippingOption[]>('/shipping/quote', { cep, subtotal }, AbortSignal.timeout(10000)),
  validateCoupon: (code: string) => post<AppliedCoupon>('/coupons/validate', { code }),
  checkoutPix: (payload: CheckoutRequest) => post<CheckoutResponse>('/checkout/pix', payload),
  reissuePix: (id: string) => post<CheckoutResponse>(`/orders/${encodeURIComponent(id)}/reissue-pix`, {}),
  orderPayment: (id: string) => request<OrderPaymentResponse>(`/orders/${encodeURIComponent(id)}/payment`),
  orderStatus: (id: string) => request<OrderStatusResponse>(`/orders/${encodeURIComponent(id)}/status`),
  tracking: (query: string) => request<TrackingPackage[]>(`/tracking?q=${encodeURIComponent(query)}`),
};

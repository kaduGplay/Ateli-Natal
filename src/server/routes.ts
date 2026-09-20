import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { ApiResponse, CheckoutRequest } from '../shared/types.js';
import { onlyDigits, isValidCep } from '../shared/validation.js';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { devPayment, shipping, tracking } from './providers/index.js';
import { getProduct, getSettings, listBanners, listCategories, listProducts } from './services/catalog.js';
import { findCoupon } from './services/coupons.js';
import { createPixOrder, getOrder, refreshOrderStatus, replaceLegacyPix, resolvePaymentOrder } from './services/orders.js';
import { createReview, listReviewSummaries, listReviews, type NewReviewInput } from './services/reviews.js';
import { receiveVoidPayWebhook } from './webhooks/voidpay.js';

/** Envolve um handler async: responde `{ ok: true, data }` ou repassa o erro. */
function api<T>(fn: (req: Request) => Promise<T>): RequestHandler {
  return (req: Request, res: Response<ApiResponse<T>>, next: NextFunction) => {
    fn(req)
      .then((data) => res.json({ ok: true, data }))
      .catch(next);
  };
}

export const routes = Router();
routes.post('/webhooks/voidpay', api(req => receiveVoidPayWebhook(req.body, 'TRANSACTION_PAID')));
routes.post('/webhooks/voidpay/created', api(req => receiveVoidPayWebhook(req.body, 'TRANSACTION_CREATED')));
routes.post('/webhooks/voidpay/paid', api(req => receiveVoidPayWebhook(req.body, 'TRANSACTION_PAID')));

// ── Vitrine ─────────────────────────────────────────────────────────────
routes.get('/products', api(() => listProducts()));
routes.get(
  '/products/:id',
  api(async (req) => {
    const product = await getProduct(String(req.params.id));
    if (!product) throw new HttpError(404, 'Produto não encontrado.');
    return product;
  }),
);
routes.get('/categories', api(() => listCategories()));
routes.get('/banners', api(() => listBanners()));
routes.get('/settings', api(() => getSettings()));

// ── Avaliações (somente de compradores verificados) ─────────────────────
routes.get('/reviews/summary', api(() => listReviewSummaries()));
routes.get('/products/:id/reviews', api((req) => listReviews(String(req.params.id))));
routes.post('/products/:id/reviews', api((req) => createReview(String(req.params.id), req.body as NewReviewInput)));

// ── Carrinho / checkout ─────────────────────────────────────────────────
routes.post(
  '/shipping/quote',
  api(async (req) => {
    const { cep, subtotal } = req.body as { cep?: string; subtotal?: number };
    if (!isValidCep(cep ?? '')) throw new HttpError(400, 'CEP inválido.');
    return shipping.quote({ cep: onlyDigits(cep ?? ''), subtotal: Number(subtotal) || 0 });
  }),
);
routes.post('/coupons/validate', api((req) => findCoupon(String((req.body as { code?: string }).code ?? ''))));
routes.post('/checkout/pix', api((req) => createPixOrder(req.body as CheckoutRequest)));
routes.post('/orders/:id/reissue-pix', api(req => replaceLegacyPix(String(req.params.id))));
routes.get('/orders/:id/payment', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
}, api(async req => {
  const id = String(req.params.id);
  const order = await resolvePaymentOrder(id);
  return {
    orderId: order.id, status: order.status, totals: order.totals, pix: order.payment.charge,
    items: order.items.map(({ name, variant, unitPrice, qty }) => ({ name, variant, unitPrice, qty })),
    shipping: { name: order.shipping.name, deliveryDays: order.shipping.deliveryDays },
  };
}));
routes.get('/orders/:id/status' , api((req) => refreshOrderStatus(String(req.params.id))));
routes.get(
  '/orders/:id/summary',
  api(async (req) => {
    const order = await getOrder(String(req.params.id));
    if (!order) throw new HttpError(404, 'Pedido não encontrado.');
    return { orderId: order.id, status: order.status, trackingCode: order.trackingCode ?? null };
  }),
);

/** Cartão: requer um gateway com campos tokenizados/hospedados. Nunca receba dados de cartão aqui. */
routes.post(
  '/checkout/card',
  api(async () => {
    throw new HttpError(501, 'Pagamento com cartão ainda não foi configurado. Use Pix.');
  }),
);

// ── Rastreio ────────────────────────────────────────────────────────────
routes.get('/tracking', api((req) => tracking.lookup(String(req.query.q ?? ''))));

// ── Somente desenvolvimento ─────────────────────────────────────────────
if (!config.isProduction) {
  routes.post(
    '/dev/orders/:id/pay',
    api(async (req) => {
      const order = await getOrder(String(req.params.id));
      if (!order) throw new HttpError(404, 'Pedido não encontrado.');
      devPayment.markPaid(order.payment.providerRef);
      return refreshOrderStatus(order.id);
    }),
  );
}

export function errorHandler(err: unknown, _req: Request, res: Response<ApiResponse<never>>, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ ok: false, message: err.message });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ ok: false, message: 'JSON inválido.' });
    return;
  }
  console.error('internal_request_error');
  res.status(500).json({ ok: false, message: 'Erro interno. Tente novamente.' });
}

import { randomUUID } from 'node:crypto';
import type { Order, Review, ReviewSummary, ReviewsResponse } from '../../shared/types.js';
import { HttpError } from '../errors.js';
import { readJson, updateJson } from '../storage.js';

export async function listReviews(productId: string): Promise<ReviewsResponse> {
  const all = await readJson<Review[]>('reviews', []);
  const reviews = all.filter((r) => r.productId === productId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const count = reviews.length;
  const average = count ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : 0;
  return { summary: { count, average }, reviews };
}

/** Resumo (quantidade e média) de todos os produtos, para as estrelas dos cards da vitrine. */
export async function listReviewSummaries(): Promise<Record<string, ReviewSummary>> {
  const all = await readJson<Review[]>('reviews', []);
  const sums = new Map<string, { count: number; total: number }>();
  for (const r of all) {
    const cur = sums.get(r.productId) ?? { count: 0, total: 0 };
    sums.set(r.productId, { count: cur.count + 1, total: cur.total + r.rating });
  }
  return Object.fromEntries(
    [...sums].map(([id, { count, total }]) => [id, { count, average: Math.round((total / count) * 10) / 10 }]),
  );
}

export interface NewReviewInput {
  orderId: string;
  email: string;
  rating: number;
  title?: string;
  text: string;
}

/** "Camila Ribeiro" + "Uberlândia/MG" -> "Camila R. - Uberlândia, MG" */
function publicAuthor(order: Order): string {
  const [first, ...rest] = order.customer.name.trim().split(/\s+/);
  const initial = rest.length ? ` ${rest[rest.length - 1]!.charAt(0).toUpperCase()}.` : '';
  return `${first}${initial} - ${order.address.city}, ${order.address.state}`;
}

/** Só quem comprou (pedido pago que contém o produto) pode avaliar, uma vez por pedido/produto. */
export async function createReview(productId: string, input: NewReviewInput): Promise<Review> {
  const rating = Math.floor(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, 'A nota deve ser de 1 a 5.');
  const text = (input.text ?? '').trim();
  if (text.length < 10 || text.length > 1000) throw new HttpError(400, 'Escreva um comentário entre 10 e 1000 caracteres.');

  const orders = await readJson<Order[]>('orders', []);
  const order = orders.find((o) => o.id === input.orderId);
  const eligible =
    order &&
    order.status === 'paid' &&
    order.customer.email.toLowerCase() === (input.email ?? '').trim().toLowerCase() &&
    order.items.some((i) => i.productId === productId);
  if (!order || !eligible) throw new HttpError(403, 'Só clientes com um pedido pago deste produto podem avaliar.');

  const review: Review = {
    id: randomUUID(),
    productId,
    orderId: order.id,
    author: publicAuthor(order),
    rating: rating as Review['rating'],
    title: input.title?.trim().slice(0, 80) || undefined,
    text,
    createdAt: new Date().toISOString(),
  };

  await updateJson<Review[]>('reviews', [], (all) => {
    if (all.some((r) => r.orderId === order.id && r.productId === productId)) {
      throw new HttpError(409, 'Você já avaliou este produto neste pedido.');
    }
    return [...all, review];
  });
  return review;
}

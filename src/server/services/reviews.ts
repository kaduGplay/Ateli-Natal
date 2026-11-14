import { randomUUID } from 'node:crypto';
import type { Order, Review, ReviewSummary, ReviewsResponse } from '../../shared/types.js';
import { HttpError } from '../errors.js';
import { readJson, updateJson } from '../storage.js';

/** As importações públicas acompanham o catálogo, mesmo quando avaliações locais estão no banco. */
async function allReviews(): Promise<Review[]> {
  const [local, imported] = await Promise.all([
    readJson<Review[]>('reviews', []),
    readJson<Review[]>('imported-reviews', []),
  ]);
  return [...new Map([...imported, ...local].map((review) => [review.id, review])).values()];
}

export async function listReviews(productId: string): Promise<ReviewsResponse> {
  const all = await allReviews();
  const reviews = all.filter((r) => r.productId === productId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { summary: summarize(reviews), reviews };
}

function summarize(reviews: Review[]): ReviewSummary {
  const rated = reviews.filter((r) => typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5);
  const average = rated.length ? Math.round(rated.reduce((sum, r) => sum + r.rating!, 0) / rated.length * 10) / 10 : 0;
  return { count: reviews.length, average, ...(rated.length !== reviews.length ? { ratedCount: rated.length } : {}) };
}

/** Quantidade de comentários e média somente das notas conhecidas. */
export async function listReviewSummaries(): Promise<Record<string, ReviewSummary>> {
  const all = await allReviews();
  const groups = new Map<string, Review[]>();
  for (const review of all) {
    const group = groups.get(review.productId) ?? [];
    group.push(review);
    groups.set(review.productId, group);
  }
  return Object.fromEntries([...groups].map(([id, reviews]) => [id, summarize(reviews)]));
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

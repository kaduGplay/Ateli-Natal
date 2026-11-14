import type { Review, ReviewsResponse } from '../../shared/types';
import { api } from '../lib/api';
import { byId, esc, qs } from '../lib/dom';
import { state } from './state';

let currentProductId = '';

const starsHtml = (rating: number): string =>
  Array.from({ length: 5 }, (_, i) => `<i class="${i < Math.round(rating) ? 'ph-fill' : 'ph'} ph-star"></i>`).join('');

function reviewCard(r: Review): string {
  const date = r.createdAt ? new Date(r.createdAt.length === 10 ? `${r.createdAt}T12:00:00` : r.createdAt).toLocaleDateString('pt-BR') : '';
  const name = r.author.split(' - ')[0] ?? r.author;
  return `
    <article class="review-card">
      <div class="review-card-head">
        <div class="review-avatar" aria-hidden="true">${esc(name.charAt(0).toUpperCase())}</div>
        <div>
          <div class="review-author">${esc(r.author)}
          </div>
          ${date ? `<div class="review-date">${esc(date)}</div>` : ''}
          ${r.source ? `<div class="review-date">Avaliação importada de ${esc(r.source)}${r.sourceUrl?.startsWith('https://') ? ` · <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer">Ver origem</a>` : ''}</div>` : ''}
        </div>
      </div>
      ${r.rating == null ? '<div class="review-date"><strong>Comentário de comprador</strong></div>' : `<div class="stars">${starsHtml(r.rating)}</div>`}
      ${r.title ? `<div class="review-title">${esc(r.title)}</div>` : ''}
      <div class="review-text">${esc(r.text)}</div>
      ${(r.photos?.length ? r.photos : r.photo ? [r.photo] : []).length ? `<div class="review-photos">${(r.photos?.length ? r.photos : [r.photo!]).map((photo, i) => `<a href="${esc(photo)}" target="_blank" rel="noopener noreferrer"><img src="${esc(photo)}" alt="Foto ${i + 1} da avaliação de ${esc(r.author)}" loading="lazy"></a>`).join('')}</div>` : ''}
    </article>`;
}

function renderSummaries(data: ReviewsResponse): void {
  const { count, average } = data.summary;
  const ratedCount = data.summary.ratedCount ?? count;

  const top = qs('#produto-view .pdp-reviews');
  if (top) {
    top.innerHTML = count
      ? ratedCount === 0 ? `<span>${count} comentários de compradores</span>` : `<div class="stars">${starsHtml(average)}</div><span>${average.toFixed(1)} (${count} ${count === 1 ? 'avaliação' : 'avaliações'})</span>`
      : '<span>Ainda sem avaliações</span>';
  }

  const summary = byId('pdpReviewsSummary');
  if (summary) {
    summary.innerHTML = count
      ? ratedCount === 0 ? `<span>${count} comentários de compradores</span>` : `<div class="stars">${starsHtml(average)}</div><strong>${average.toFixed(1)}</strong><span>· ${count} ${count === 1 ? 'avaliação' : 'avaliações'}</span>`
      : '<span>Este produto ainda não tem avaliações.</span>';
  }

  const list = byId('pdpReviewsList');
  if (list) {
    list.innerHTML = count
      ? data.reviews.map(reviewCard).join('')
      : '<div class="reviews-empty">Este produto ainda não tem avaliações.</div>';
  }
}

export async function loadReviews(productId: string): Promise<void> {
  currentProductId = productId;
  try {
    const data = await api.reviews(productId);
    if (currentProductId !== productId) return;
    state.summaries[productId] = data.summary;
    renderSummaries(data);
  } catch {
    if (currentProductId !== productId) return;
    renderSummaries({ summary: { count: 0, average: 0 }, reviews: [] });
  }
}

import { byId, qsa } from '../lib/dom';
import { renderProductCard } from './product-card';
import { state } from './state';

const KEY = 'atelieNatalFavorites';

function load(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

let items = load();

export const isFavorite = (id: string): boolean => items.includes(id);

function updateButtons(id: string): void {
  const fav = isFavorite(id);
  qsa<HTMLElement>(`.fav-btn[data-id="${CSS.escape(id)}"] i`).forEach((icon) => {
    icon.className = fav ? 'ph-fill ph-heart' : 'ph ph-heart';
    icon.style.color = fav ? '#e11d48' : '#333';
  });
}

export function toggleFavorite(id: string): void {
  items = isFavorite(id) ? items.filter((x) => x !== id) : [...items, id];
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* sem persistência */
  }
  updateButtons(id);
  if (window.location.hash.startsWith('#favoritos')) renderFavorites();
}

export function renderFavorites(): void {
  const grid = byId('favoritosGrid');
  const empty = byId('favoritosEmpty');
  if (!grid || !empty) return;

  const products = state.products.filter((p) => isFavorite(p.id));
  const has = products.length > 0;
  grid.style.display = has ? 'grid' : 'none';
  empty.style.display = has ? 'none' : 'block';
  grid.innerHTML = products.map((p, i) => renderProductCard(p, { index: i })).join('');
}

import type { CartLine } from '../../shared/types';
import { pixel } from '../lib/pixel';

const KEY = 'atelieNatalCart';

export interface AddToCartInput {
  productId: string;
  name: string;
  image: string;
  price: number;
  variant?: string;
  qty?: number;
  isBump?: boolean;
}

type Listener = (lines: CartLine[]) => void;

function load(): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as CartLine[]).filter((l) => l && typeof l.productId === 'string' && l.qty > 0) : [];
  } catch {
    return [];
  }
}

let lines: CartLine[] = load();
const listeners = new Set<Listener>();

function commit(next: CartLine[]): void {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* armazenamento indisponível: o carrinho vale só nesta aba */
  }
  listeners.forEach((fn) => fn(lines));
}

const lineIdOf = (i: Pick<AddToCartInput, 'productId' | 'variant' | 'isBump'>): string =>
  `${i.productId}::${i.variant ?? ''}${i.isBump ? '::bump' : ''}`;

export const cart = {
  lines: (): CartLine[] => lines,
  count: (): number => lines.reduce((sum, l) => sum + l.qty, 0),
  total: (): number => lines.reduce((sum, l) => sum + l.price * l.qty, 0),
  has: (productId: string, isBump = false): boolean => lines.some((l) => l.productId === productId && l.isBump === isBump),

  add(input: AddToCartInput): void {
    const lineId = lineIdOf(input);
    const qty = Math.max(1, Math.floor(input.qty ?? 1));
    pixel.addToCart({ id: input.productId, name: input.name, price: input.price, qty });
    const existing = lines.find((l) => l.lineId === lineId);
    if (existing) {
      commit(lines.map((l) => (l.lineId === lineId ? { ...l, qty: l.qty + qty } : l)));
      return;
    }
    commit([
      ...lines,
      {
        lineId,
        productId: input.productId,
        variant: input.variant ?? '',
        name: input.name,
        image: input.image,
        price: input.price,
        qty,
        isBump: Boolean(input.isBump),
      },
    ]);
  },

  remove: (lineId: string): void => commit(lines.filter((l) => l.lineId !== lineId)),

  removeBump: (productId: string): void => commit(lines.filter((l) => !(l.productId === productId && l.isBump))),

  setQty(lineId: string, qty: number): void {
    if (qty < 1) return;
    commit(lines.map((l) => (l.lineId === lineId ? { ...l, qty } : l)));
  },

  clear: (): void => commit([]),

  onChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

import type { Category, Product, ReviewSummary } from '../../shared/types';

export const state = {
  products: [] as Product[],
  categories: [] as Category[],
  summaries: {} as Record<string, ReviewSummary>,
};

export const findProduct = (id: string): Product | undefined => state.products.find((p) => p.id === id);

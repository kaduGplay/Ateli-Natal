import type { StoreSettings } from '../../shared/types';

const brlFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const brl = (value: number): string => brlFormatter.format(value);

let settings: StoreSettings = {
  storeName: 'Ateliê Natal',
  topbarMessage: '',
  allCategoryImage: '',
  instagram: '',
  facebook: '',
  whatsapp: '',
  freeShippingThreshold: 150,
  pixDiscountPercent: 10,
  orderBumpDiscountPercent: 20,
  maxInstallments: 6,
  installmentMinValue: 50,
  metaPixelId: '',
};

export const getStoreSettings = (): StoreSettings => settings;
export const setStoreSettings = (next: StoreSettings): void => {
  settings = next;
};

export function installments(price: number): { count: number; value: number } {
  const count = Math.min(settings.maxInstallments, Math.floor(price / settings.installmentMinValue)) || 1;
  return { count, value: price / count };
}

export function discountPercent(price: number, oldPrice: number | null): number {
  return oldPrice && oldPrice > price ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
}

export function whatsappLink(message: string): string {
  let digits = settings.whatsapp.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

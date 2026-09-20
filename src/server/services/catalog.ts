import type { Banner, Category, Product, StoreSettings } from '../../shared/types.js';
import { readJson } from '../storage.js';

export async function listProducts(): Promise<Product[]> {
  const all = await readJson<Product[]>('catalog', []);
  return all.filter((p) => p.active).sort((a, b) => a.order - b.order);
}

export async function getProduct(id: string): Promise<Product | undefined> {
  return (await listProducts()).find((p) => p.id === id);
}

export async function listCategories(): Promise<Category[]> {
  const all = await readJson<Category[]>('categories', []);
  return all.filter((c) => c.active).sort((a, b) => a.order - b.order);
}

export async function listBanners(): Promise<Banner[]> {
  const all = await readJson<Banner[]>('banners', []);
  return all.filter((b) => b.active).sort((a, b) => a.order - b.order);
}

export async function getSettings(): Promise<StoreSettings> {
  return readJson<StoreSettings>('settings', {
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
  });
}

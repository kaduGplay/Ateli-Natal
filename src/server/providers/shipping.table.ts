import type { ShippingOption } from '../../shared/types.js';
import { readJson } from '../storage.js';
import type { ShippingProvider, ShippingQuoteInput } from './types.js';

interface ShippingRow extends ShippingOption {
  /** Subtotal a partir do qual o frete é grátis (0 = nunca). */
  freeAbove: number;
}

interface ShippingFile {
  options: ShippingRow[];
}

/** Frete por tabela fixa (data/shipping.json). Provisório até você ligar sua transportadora. */
export class TableShippingProvider implements ShippingProvider {
  async quote({ subtotal }: ShippingQuoteInput): Promise<ShippingOption[]> {
    const file = await readJson<ShippingFile>('shipping', { options: [] });
    return file.options.map(({ freeAbove, ...option }) => ({
      ...option,
      price: freeAbove > 0 && subtotal >= freeAbove ? 0 : option.price,
    }));
  }
}

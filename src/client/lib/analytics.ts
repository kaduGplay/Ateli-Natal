import type { StoreSettings } from '../../shared/types';
import { pixel } from './pixel';
import { initUtmify } from './utmify';

/** Liga os pixels de marketing configurados em data/settings.json (Meta e UTMify). */
export function initAnalytics(settings: Pick<StoreSettings, 'metaPixelId' | 'utmifyPixelId'>): void {
  pixel.init(settings.metaPixelId);
  initUtmify(settings.utmifyPixelId);
}

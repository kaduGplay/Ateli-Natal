/** Pixel da UTMify (captura de UTMs e conversões). Carregado do CDN oficial da UTMify. */
declare global {
  interface Window {
    pixelId?: string;
  }
}

const SCRIPT_URL = 'https://cdn.utmify.com.br/scripts/pixel/pixel.js';
let loaded = false;

export function initUtmify(pixelId: string): void {
  if (!pixelId || loaded) return;
  loaded = true;
  window.pixelId = pixelId;
  const script = document.createElement('script');
  script.src = SCRIPT_URL;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
}

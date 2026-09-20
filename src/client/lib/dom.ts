export function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function must<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = byId<T>(id);
  if (!el) throw new Error(`Elemento #${id} não encontrado`);
  return el;
}

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function qsa<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto para uso dentro de HTML/atributos. Use sempre em dados vindos de usuário. */
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c);
}

export function setDisplay(el: HTMLElement | null, display: string): void {
  if (el) el.style.display = display;
}

export const PLACEHOLDER_IMG =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'><rect width='300' height='300' fill='%23f1f5f9'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='16' font-family='sans-serif'>Sem imagem</text></svg>";

/** Troca imagens quebradas por um placeholder (o evento `error` não borbulha, por isso captura). */
export function installImageFallback(): void {
  document.addEventListener(
    'error',
    (e) => {
      const t = e.target;
      if (t instanceof HTMLImageElement && t.src !== PLACEHOLDER_IMG) t.src = PLACEHOLDER_IMG;
    },
    true,
  );
}

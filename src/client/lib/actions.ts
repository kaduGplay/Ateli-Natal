export type ActionHandler = (el: HTMLElement, event: Event) => void;

const handlers = new Map<string, ActionHandler>();

/** Registra handlers para elementos com `data-action="nome"` (delegação de eventos de clique). */
export function registerActions(map: Record<string, ActionHandler>): void {
  for (const [name, fn] of Object.entries(map)) handlers.set(name, fn);
}

export function initActions(): void {
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const el = target.closest<HTMLElement>('[data-action]');
    const handler = el?.dataset.action ? handlers.get(el.dataset.action) : undefined;
    if (!el || !handler) return;
    if (el instanceof HTMLAnchorElement) event.preventDefault();
    handler(el, event);
  });
}

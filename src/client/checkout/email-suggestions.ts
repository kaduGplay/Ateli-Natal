const domains = ['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.br', 'icloud.com', 'live.com'];

export function initEmailSuggestions(input: HTMLInputElement): void {
  const list = document.createElement('div');
  list.id = 'checkoutEmailSuggestions';
  list.className = 'email-suggestions';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', 'Sugestões de e-mail');
  list.hidden = true;
  input.parentElement!.appendChild(list);
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', 'false');
  let choices: string[] = [];
  let active = -1;

  const hide = (): void => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  };
  const select = (index: number): void => {
    const email = choices[index];
    if (!email) return;
    input.value = email;
    input.setCustomValidity('');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    hide();
    input.focus();
  };
  const render = (): void => {
    const email = input.value.trim();
    const parts = email.split('@');
    if (parts.length !== 2 || !parts[0] || /\s/.test(email)) { hide(); return; }
    const suffix = parts[1]!.toLowerCase();
    choices = domains.filter(domain => domain.startsWith(suffix) && domain !== suffix).map(domain => `${parts[0]}@${domain}`);
    list.replaceChildren();
    active = -1;
    input.removeAttribute('aria-activedescendant');
    if (!choices.length) { hide(); return; }
    choices.forEach((email, index) => {
      const option = document.createElement('div');
      option.id = `checkout-email-option-${index}`;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = email;
      option.addEventListener('pointerdown', event => event.preventDefault());
      option.addEventListener('click', () => select(index));
      list.appendChild(option);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('blur', hide);
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') { hide(); return; }
    if (list.hidden) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      active = event.key === 'ArrowDown' ? (active + 1) % choices.length : (active <= 0 ? choices.length - 1 : active - 1);
      Array.from(list.children).forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
      input.setAttribute('aria-activedescendant', `checkout-email-option-${active}`);
      list.children[active]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      select(active);
    }
  });
}

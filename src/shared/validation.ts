/** Validações usadas no checkout (cliente) e na API (servidor). */

export function onlyDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

export function isValidCpf(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const check = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf.charAt(i)) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(cpf.charAt(9)) && check(10) === Number(cpf.charAt(10));
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value ?? '').trim());
}

export function isValidCep(value: string): boolean {
  return onlyDigits(value).length === 8;
}

export function isValidPhone(value: string): boolean {
  const d = onlyDigits(value);
  return d.length === 10 || d.length === 11;
}

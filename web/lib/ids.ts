/** Id público corto (10 caracteres [a-z0-9]) para /crear?b=<public_id>. ~51 bits de entropía. */
export function newPublicId(len = 10): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // sin 0/o/1/l
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const PUBLIC_ID_RE = /^[a-z0-9]{8,16}$/;

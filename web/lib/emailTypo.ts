/**
 * Erratas en el dominio del email (auditoría 26 oct, menores). Con una errata, el enlace del libro le llega a otra
 * persona. Decisión de Álvaro: sin segundo campo. Si el dominio se parece mucho a uno común, se ofrece la corrección
 * bajo el campo (components/crear/StepCast.tsx). Si el dominio es correcto o no lo conocemos, no se dice nada: más
 * vale callar con un dominio raro que molestar con uno bueno.
 */

/** Dominios comunes en España, del más usado al menos: si dos se parecen igual, gana el primero. */
const COMMON = [
  "gmail.com",
  "hotmail.com",
  "hotmail.es",
  "outlook.es",
  "outlook.com",
  "yahoo.es",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "msn.com",
  "telefonica.net",
  "movistar.es",
  "orange.es",
  "gmx.es",
  "gmx.com",
  "googlemail.com",
];

/** Proveedores con un solo dominio: gmail.es o icloud.es no existen, así que cualquier otro final es una errata. */
const ONLY: Record<string, string> = { gmail: "gmail.com", googlemail: "googlemail.com", icloud: "icloud.com" };

/** Dominios que existen y se parecen a uno común (email.com y gmail.com se diferencian en una letra). */
const REAL = new Set(["email.com", "mail.com", "ymail.com", "cloud.com"]);

/**
 * Finales de otros países que están a una letra de .es o de .com y existen: hotmail.se, live.se, gmx.us. Los demás
 * (hotmail.fr, yahoo.com.ar) ya están lejos. «.co» y «.cm» no están a propósito: son erratas de «.com».
 */
const REAL_TLDS = new Set(["se", "us"]);

const split = (d: string): [string, string] => {
  const dot = d.indexOf(".");
  return dot < 0 ? [d, ""] : [d.slice(0, dot), d.slice(dot + 1)];
};

/** Distancia entre dos textos: letras de más, de menos, cambiadas o dos seguidas al revés («gmial»). */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

function fixDomain(domain: string): string | null {
  const [name, tld] = split(domain);
  if (ONLY[name]) return ONLY[name];
  // sin punto: «gmailcom», «hotmailes» o solo «hotmail»
  if (!tld) return COMMON.find((c) => c.replace(".", "") === domain) ?? COMMON.find((c) => c.startsWith(`${domain}.`)) ?? null;
  // el proveedor bien escrito con el final de otro país existe: no se toca
  if (REAL_TLDS.has(tld) && COMMON.some((c) => split(c)[0] === name)) return null;
  let best: string | null = null;
  let bestD = Infinity;
  for (const c of COMMON) {
    const [cName, cTld] = split(c);
    // una letra en el nombre y otra en el final, como mucho. En los nombres cortos (live, msn, gmx), ni una: «liv.com»
    // puede ser de verdad
    const dn = distance(name, cName);
    const dt = distance(tld, cTld);
    if (dn > (cName.length >= 5 ? 1 : 0) || dt > 1) continue;
    if (dn + dt < bestD) {
      best = c;
      bestD = dn + dt;
    }
  }
  return best;
}

/**
 * El email con el dominio corregido si parece una errata de uno común («ana@gmial.com» → «ana@gmail.com»); null si
 * está bien, si no conocemos el dominio o si aún no hay dominio. La parte de antes de la arroba no se toca.
 */
export function suggestEmail(email: string): string | null {
  const e = email.trim();
  const at = e.lastIndexOf("@");
  if (at < 1 || at === e.length - 1 || e.length > 120) return null;
  const domain = e.slice(at + 1).toLowerCase();
  if (COMMON.includes(domain) || REAL.has(domain)) return null;
  const fix = fixDomain(domain);
  return fix && fix !== domain ? `${e.slice(0, at)}@${fix}` : null;
}

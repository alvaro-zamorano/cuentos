/** Auditoría 26 oct, menores: si el dominio del email parece una errata de uno común, se ofrece la corrección. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestEmail } from "../../lib/emailTypo";

test("erratas comunes: se ofrece el dominio bueno y la parte de antes de la arroba no se toca", () => {
  const cases: [string, string][] = [
    ["ana@gmial.com", "ana@gmail.com"],
    ["ana@gamil.com", "ana@gmail.com"],
    ["ana@gmai.com", "ana@gmail.com"],
    ["ana@gmaill.com", "ana@gmail.com"],
    ["ana@gmail.con", "ana@gmail.com"],
    ["ana@gmail.co", "ana@gmail.com"],
    ["ana@gmail.cm", "ana@gmail.com"],
    ["ana@gmail.es", "ana@gmail.com"],
    ["ana@gmail", "ana@gmail.com"],
    ["ana@gmailcom", "ana@gmail.com"],
    ["ana@gmail.com.", "ana@gmail.com"],
    ["ana@gnail.con", "ana@gmail.com"],
    ["ana@hotmial.com", "ana@hotmail.com"],
    ["ana@hotmail.co", "ana@hotmail.com"],
    ["ana@hotmal.es", "ana@hotmail.es"],
    ["ana@hotmail.e", "ana@hotmail.es"],
    ["ana@hotmailes", "ana@hotmail.es"],
    ["ana@hotmail", "ana@hotmail.com"],
    ["ana@outlok.es", "ana@outlook.es"],
    ["ana@outlook.cm", "ana@outlook.com"],
    ["ana@yaho.es", "ana@yahoo.es"],
    ["ana@yahoo.co", "ana@yahoo.com"],
    ["ana@iclod.com", "ana@icloud.com"],
    ["ana@icloud.es", "ana@icloud.com"],
    ["ana@live.con", "ana@live.com"],
    ["ana@msn.co", "ana@msn.com"],
    ["ana@telefonica.ner", "ana@telefonica.net"],
    ["ana@movistar.e", "ana@movistar.es"],
    ["Ana.Lopez+cuentos@GMIAL.com", "Ana.Lopez+cuentos@gmail.com"],
    [" ana@gmial.com ", "ana@gmail.com"],
  ];
  for (const [typed, want] of cases) assert.equal(suggestEmail(typed), want, typed);
});

test("dominio correcto o desconocido: no se dice nada", () => {
  const quiet = [
    "ana@gmail.com",
    "ANA@GMAIL.COM",
    "ana@hotmail.com",
    "ana@hotmail.es",
    "ana@outlook.es",
    "ana@yahoo.es",
    "ana@icloud.com",
    "ana@telefonica.net",
    "ana@movistar.es",
    // existen y se parecen a uno común
    "ana@email.com",
    "ana@ymail.com",
    "ana@mail.com",
    "ana@cloud.com",
    "ana@hotmail.se",
    "ana@gmx.us",
    // de otro país, ya lejos
    "ana@hotmail.fr",
    "ana@yahoo.com.ar",
    "ana@gmx.net",
    // desconocidos
    "ana@empresa.es",
    "ana@educa.madrid.org",
    "ana@hotmart.com",
    "ana@liv.com",
    "ana@telefonica.com",
    "ana@me.com",
  ];
  for (const e of quiet) assert.equal(suggestEmail(e), null, e);
});

test("mientras se escribe, sin arroba o sin dominio, no hay nada que proponer", () => {
  for (const e of ["", "ana", "ana@", "@gmail.com", "a".repeat(200) + "@gmial.com"]) assert.equal(suggestEmail(e), null, e);
});

test("erratas del final en cualquier dominio, también en los que no conocemos (revisión 27 oct)", () => {
  const cases: [string, string][] = [
    ["ana@miempresa.con", "ana@miempresa.com"],
    ["ana@miempresa.cmo", "ana@miempresa.com"],
    ["ana@miempresa.ocm", "ana@miempresa.com"],
    ["ana@miempresa.comm", "ana@miempresa.com"],
    ["ana@miempresa.som", "ana@miempresa.com"],
    ["ana@miempresa.xom", "ana@miempresa.com"],
    ["ana@colegio.ess", "ana@colegio.es"],
    ["ana@educa.madrid.ess", "ana@educa.madrid.es"],
    // un proveedor conocido sigue yendo a su dominio, no solo al final bueno
    ["ana@hotmial.con", "ana@hotmail.com"],
  ];
  for (const [typed, want] of cases) assert.equal(suggestEmail(typed), want, typed);
  // finales que existen: con un dominio desconocido no se tocan
  for (const e of ["ana@empresa.co", "ana@empresa.cm", "ana@empresa.om", "ana@empresa.com.co", "ana@empresa.so", "ana@empresa.es", "ana@empresa.rs"]) assert.equal(suggestEmail(e), null, e);
});

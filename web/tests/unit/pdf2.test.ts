import { test } from "node:test";
import assert from "node:assert/strict";
import { joinDashes } from "../../lib/pdf/text";

test("PDF: la raya de diálogo no se separa de la palabra que la sigue", () => {
  assert.equal(joinDashes("—Hoy haré la torre —anunció Mateo. —Ya."), "—⁠Hoy haré la torre —⁠anunció Mateo. —⁠Ya.");
  assert.equal(joinDashes("susurró—. Solo"), "susurró—⁠. Solo");
  assert.equal(joinDashes("una raya — suelta"), "una raya — suelta", "con espacio detrás no se toca");
});

/** Primera frase de una página, para enseñarla mientras se espera (cortada si es muy larga). */
export function firstSentence(text: string, max = 120): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^.+?[.!?…](?=\s|$)/);
  const s = (m ? m[0] : t).trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}

/**
 * Un Chromium cada vez por instancia (auditoría 26 oct, I10). En Vercel varias peticiones comparten instancia, y cada PDF
 * con su navegador ocupa unos 500 MB: tres a la vez llegaban a 1,6 GB de los 2 GB del plan. Lo que llega mientras se
 * pinta otro espera su turno. Sin `server-only`: lo prueban los tests.
 */
let chain: Promise<unknown> = Promise.resolve();

export function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

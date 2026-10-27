/**
 * Un Chromium cada vez por instancia (auditoría 26 oct, I10). En Vercel varias peticiones comparten instancia, y cada PDF
 * con su navegador ocupa unos 500 MB: tres a la vez llegaban a 1,6 GB de los 2 GB del plan. Lo que llega mientras se
 * pinta otro espera su turno. Con `maxWaitMs`, si el turno no llega a tiempo se rinde (QueueBusy) y su trabajo ya no se
 * hace: así la espera no se come el plazo de la ruta (revisión 27 oct). Sin `server-only`: lo prueban los tests.
 */
let chain: Promise<unknown> = Promise.resolve();

export class QueueBusy extends Error {
  constructor() {
    super("cola_ocupada");
  }
}

export function oneAtATime<T>(fn: () => Promise<T>, { maxWaitMs }: { maxWaitMs?: number } = {}): Promise<T> {
  let started = false;
  let abandoned = false;
  const turn = () => {
    if (abandoned) return Promise.reject(new QueueBusy());
    started = true;
    return fn();
  };
  const run = chain.then(turn, turn);
  chain = run.catch(() => undefined);
  if (!maxWaitMs) return run;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (started) return;
      abandoned = true;
      reject(new QueueBusy());
    }, maxWaitMs);
    run.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        if (!abandoned) reject(e);
      },
    );
  });
}

-- Motivo de «Otra versión» y avisos de «Sigue sin estar bien» (18 oct). Una fila por petición, para corregir el
-- prompt de la versión nueva y para saber qué falla en las ilustraciones. Solo aditiva.
--
-- Privacidad: `note` es texto libre del padre (puede llevar nombres). El borrado diario (lib/purge.ts) vacía `note` y
-- desliga la fila del libro y del job a los 30 días; se quedan el motivo, la página, la versión, el estilo y la fecha,
-- que no identifican a nadie.

create table if not exists public.cuentos_feedback (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.cuentos_books (id) on delete set null,
  job_id uuid references public.cuentos_generation_jobs (id) on delete set null,
  kind text not null check (kind in ('redo', 'report')),
  page_n smallint not null check (page_n between 1 and 12),
  variant smallint,
  reason text not null,
  note text,
  style_id text,
  created_at timestamptz not null default now()
);

create index if not exists cuentos_feedback_book_idx on public.cuentos_feedback (book_id);
create index if not exists cuentos_feedback_created_idx on public.cuentos_feedback (created_at);

-- sin políticas: solo el servidor (service role) lee y escribe
alter table public.cuentos_feedback enable row level security;

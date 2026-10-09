-- cuentos_2_storage · bucket privado `cuentos` (hojas, escenas, PDFs). Sin políticas: solo service role.
insert into storage.buckets (id, name, public)
values ('cuentos', 'cuentos', false)
on conflict (id) do nothing;

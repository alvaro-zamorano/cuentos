-- cuentos_3_assets_seed · generado por scripts/assets_build.py desde assets/manifest.json
-- Anclas: ruta en el repo (assets/raw, ignorado por git). Recortes: ruta pública /catalog/<estilo>/<categoria>/<id>.png
insert into public.cuentos_assets (kind, style_id, category, trait_id, path)
select 'anchor', s, null, null, p from (values
  ('3d', 'assets/raw/Cometa roja en el prado.png'),
  ('flat', 'assets/raw/El niño, la abuela y la cometa.png'),
  ('gouache', 'assets/raw/La cometa roja en el prado-1.png'),
  ('papercraft', 'assets/raw/La cometa roja en el prado.png'),
  ('lapiz', 'assets/raw/La cometa roja y la abuela-2.png'),
  ('acuarela', 'assets/raw/La cometa y la abuela.png')
) a(s, p)
on conflict (path) do nothing;

insert into public.cuentos_assets (kind, style_id, category, trait_id, path)
select 'crop', g.s, g.c, t.id, '/catalog/' || g.s || '/' || g.c || '/' || t.id || '.png'
from (values
  ('3d', 'accessory', '{gorro,diadema,mochila,sombrero,bufanda,lazo,casco,bolso}'),
  ('3d', 'eyes', '{puntos,redondos,ovalados,dormilones,cerrados,risuenos}'),
  ('3d', 'glasses', '{redondas,redondas-gruesas,ovaladas,cuadradas,pasta,transparentes}'),
  ('3d', 'grandparent', '{abuela-mono,abuelo-gafas,abuela-rizos,abuelo-calvo,abuela-ondas,abuelo-barba,abuela-gafas,abuelo-gris}'),
  ('3d', 'outfit', '{chubasquero,peto,jersey,marinera,vestido,plumifero,pijama,verano}'),
  ('3d', 'pet', '{corgi,golden,manchado,atigrado,blanquinegro,conejo,cobaya,periquito}'),
  ('3d', 'skin', '{muy-clara,clara,melocoton,media,tostada,morena,morena-oscura,oscura}'),
  ('acuarela', 'accessory', '{gorro,diadema,mochila,sombrero,bufanda,lazo,casco,bolso}'),
  ('acuarela', 'eyes', '{puntos,redondos,ovalados,dormilones,cerrados,risuenos}'),
  ('acuarela', 'glasses', '{redondas,redondas-gruesas,ovaladas,cuadradas,pasta,transparentes}'),
  ('acuarela', 'grandparent', '{abuela-mono,abuela-rizos,abuela-ondas,abuela-gafas,abuelo-calvo,abuelo-barba,abuelo-gafas,abuelo-gris}'),
  ('acuarela', 'pet', '{corgi,golden,manchado,atigrado,blanquinegro,conejo,cobaya,periquito}'),
  ('acuarela', 'skin', '{muy-clara,clara,melocoton,media,tostada,morena,morena-oscura,oscura}'),
  ('flat', 'accessory', '{gorro,diadema,mochila,sombrero,bufanda,lazo,casco,bolso}'),
  ('flat', 'eyes', '{puntos,redondos,ovalados,dormilones,cerrados,risuenos}'),
  ('flat', 'glasses', '{redondas,redondas-gruesas,ovaladas,cuadradas,pasta,transparentes}'),
  ('flat', 'grandparent', '{abuela-ondas,abuelo-gafas,abuela-rizos,abuelo-calvo,abuelo-barba,abuela-gafas,abuelo-gris,abuela-mono}'),
  ('flat', 'hair', '{corto,flequillo,melena,coleta,rizos,rizos-media,rizos-largos,afro,trenzas,rapado,ondulado,mono}'),
  ('flat', 'outfit', '{chubasquero,peto,jersey,marinera,vestido,plumifero,pijama,verano}'),
  ('flat', 'pet', '{corgi,golden,manchado,atigrado,blanquinegro,conejo,cobaya,periquito}'),
  ('flat', 'skin', '{muy-clara,clara,melocoton,media,tostada,morena,morena-oscura,oscura}'),
  ('gouache', 'accessory', '{gorro,diadema,mochila,sombrero,bufanda,lazo,casco,bolso}'),
  ('gouache', 'eyes', '{puntos,redondos,ovalados,dormilones,cerrados,risuenos}'),
  ('gouache', 'glasses', '{redondas,redondas-gruesas,ovaladas,cuadradas,pasta,transparentes}'),
  ('gouache', 'grandparent', '{abuela-ondas,abuela-rizos,abuela-gafas,abuela-mono,abuelo-calvo,abuelo-gris,abuelo-barba,abuelo-gafas}'),
  ('gouache', 'hair', '{corto,flequillo,melena,coleta,rizos,rizos-media,rizos-largos,afro,trenzas,rapado,ondulado,mono}'),
  ('gouache', 'outfit', '{chubasquero,peto,jersey,marinera,vestido,plumifero,pijama,verano}'),
  ('gouache', 'pet', '{corgi,golden,manchado,atigrado,blanquinegro,conejo,cobaya,periquito}'),
  ('gouache', 'skin', '{muy-clara,clara,melocoton,media,tostada,morena,morena-oscura,oscura}'),
  ('lapiz', 'accessory', '{gorro,diadema,mochila,sombrero,bufanda,lazo,casco,bolso}'),
  ('lapiz', 'eyes', '{puntos,redondos,ovalados,dormilones,cerrados,risuenos}'),
  ('lapiz', 'glasses', '{redondas,redondas-gruesas,ovaladas,cuadradas,pasta,transparentes}'),
  ('lapiz', 'grandparent', '{abuela-mono,abuelo-gafas,abuela-rizos,abuelo-calvo,abuela-gafas,abuelo-barba,abuela-ondas,abuelo-gris}'),
  ('lapiz', 'hair', '{corto,flequillo,melena,coleta,rizos,rizos-media,rizos-largos,afro,trenzas,rapado,ondulado,mono}'),
  ('lapiz', 'outfit', '{chubasquero,peto,jersey,marinera,vestido,plumifero,pijama,verano}'),
  ('lapiz', 'pet', '{corgi,golden,manchado,atigrado,blanquinegro,conejo,cobaya,periquito}'),
  ('lapiz', 'skin', '{muy-clara,clara,melocoton,media,tostada,morena,morena-oscura,oscura}'),
  ('papercraft', 'accessory', '{gorro,diadema,mochila,sombrero,bufanda,lazo,casco,bolso}'),
  ('papercraft', 'eyes', '{puntos,redondos,ovalados,dormilones,cerrados,risuenos}'),
  ('papercraft', 'glasses', '{redondas,redondas-gruesas,ovaladas,cuadradas,pasta,transparentes}'),
  ('papercraft', 'grandparent', '{abuela-mono,abuela-rizos,abuela-ondas,abuela-gafas,abuelo-calvo,abuelo-gris,abuelo-barba,abuelo-gafas}'),
  ('papercraft', 'outfit', '{chubasquero,peto,jersey,marinera,vestido,plumifero,pijama,verano}'),
  ('papercraft', 'pet', '{corgi,golden,manchado,atigrado,blanquinegro,conejo,cobaya,periquito}'),
  ('papercraft', 'skin', '{muy-clara,clara,melocoton,media,tostada,morena,morena-oscura,oscura}')
) g(s, c, ids)
cross join lateral unnest(g.ids::text[]) as t(id)
on conflict (path) do nothing;

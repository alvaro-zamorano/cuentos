-- cuentos_4_outfit_jersey · el conjunto O03 pasa de id 'azul' a 'jersey' (evita confusión con colores)
update public.cuentos_assets
set trait_id = 'jersey', path = replace(path, '/outfit/azul.png', '/outfit/jersey.png')
where kind = 'crop' and category = 'outfit' and trait_id = 'azul';

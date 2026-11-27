CREATE OR REPLACE FUNCTION wired_duel.species_fighter(p_species uuid, p_level integer, p_name text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'name', coalesce(nullif(btrim(p_name), ''), s.name),
    'species', s.name, 'slug', s.slug, 'level', p_level, 'rarity', s.rarity,
    'tier', stats.tier, 'crit', 4 + stats.rarity,
    'hp', round((60 + p_level * 2 + (stats.tier - 1) * 8) * (1 + (stats.rarity - 1) * 0.03)),
    'attack', round((12 + p_level * 0.45 + (stats.tier - 1) * 2) * (1 + (stats.rarity - 1) * 0.02)),
    'skill', s.ability_name
  )
  from public.pet_species s
  cross join lateral (
    select coalesce(array_position(array['common','uncommon','rare','epic','legendary','mythical'], lower(s.rarity)), 1) rarity,
      case when p_level >= 90 then 4 when p_level >= 45 then 3 when p_level >= 15 then 2 else 1 end tier
  ) stats
  where s.id = p_species
$function$;

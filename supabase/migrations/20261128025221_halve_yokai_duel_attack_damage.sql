CREATE OR REPLACE FUNCTION wired_duel.damage_for_move(p_fighter jsonb, p_move integer, p_critical boolean, p_guarded boolean)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE STRICT
 SET search_path TO ''
AS $function$
  select round((p_fighter->>'attack')::numeric
    * coalesce((p_fighter->'move_power'->>p_move)::numeric,
        (array[0,1,1.3,1.8,2.5,3.5])[p_move + 1])
    * case when p_critical then 1.5 else 1 end
    * case when p_guarded then 0 else 0.5 end)::integer
$function$;

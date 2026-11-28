CREATE FUNCTION public.list_yokai_pound_timed_v2(p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, pet_id uuid, nickname text, level integer, species text, slug text, seller text, mine boolean, is_high_bidder boolean, opening_bid integer, bid_points integer, reserve_bid integer, ends_at timestamptz, reserve_met boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.id, p.id, p.nickname, p.level, s.name, s.slug, seller.username,
    l.seller_id = auth.uid(), coalesce(l.bidder_id = auth.uid(),false), l.opening_bid,
    case when l.bidder_id is not null then l.bid_points end,
    case when l.seller_id = auth.uid() then l.reserve_bid end, l.ends_at,
    case when l.reserve_bid is not null then coalesce(l.bid_points >= l.reserve_bid,false) end
  from private.yokai_pound_listings l
  join public.user_pets p on p.id=l.pet_id and p.owner_id=l.seller_id
  join public.pet_species s on s.id=p.species_id
  join public.profiles seller on seller.id=l.seller_id
  where auth.uid() is not null and not private.yokai_pound_blocked(auth.uid(),l.seller_id)
    and (l.ends_at is null or l.ends_at > statement_timestamp())
    and l.exchange_min_level is null
  order by l.created_at desc, l.id
  limit 30 offset greatest(p_offset,0);
$function$;
revoke all on function public.list_yokai_pound_timed_v2(integer) from public, anon;
grant execute on function public.list_yokai_pound_timed_v2(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.list_yokai_pound_timed(p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, pet_id uuid, nickname text, level integer, species text, slug text, seller text, mine boolean, is_high_bidder boolean, opening_bid integer, bid_points integer, reserve_bid integer, ends_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.id, l.pet_id, l.nickname, l.level, l.species, l.slug, l.seller,
    l.mine, l.is_high_bidder, l.opening_bid, l.bid_points, l.reserve_bid, l.ends_at
  from public.list_yokai_pound_timed_v2(p_offset) l;
$function$;

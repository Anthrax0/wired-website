create extension if not exists pg_cron with schema pg_catalog;

alter table private.yokai_pound_listings
  add column reserve_bid integer check (reserve_bid is null or (opening_bid > 0 and reserve_bid between opening_bid and 10000000)),
  add column ends_at timestamptz;

create index yokai_pound_ends_at_idx on private.yokai_pound_listings(ends_at) where ends_at is not null;

CREATE OR REPLACE FUNCTION private.manage_yokai_pound(actor uuid, p_action text, p_id uuid, p_points integer, p_reserve integer, p_hours integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  listing private.yokai_pound_listings%rowtype;
  adopter uuid;
  price integer;
begin
  if actor is null then raise exception 'Sign in to use Yokai Pound.'; end if;
  if p_action = 'list' then
    if p_points is null or p_points not between 0 and 10000000 then raise exception 'Enter a valid opening bid.'; end if;
    if (p_reserve is not null and (p_points = 0 or p_reserve not between p_points and 10000000))
      or (p_hours is not null and p_hours not between 1 and 168) then
      raise exception 'Check the minimum accepted bid and listing duration.';
    end if;
    perform 1 from public.user_pets where id=p_id and owner_id=actor for update;
    if not found then raise exception 'You can only list a yokai you own.'; end if;
    if exists (select 1 from private.yokai_pound_listings where pet_id=p_id and seller_id=actor) then
      raise exception 'This yokai is already listed.';
    end if;
    insert into private.yokai_pound_listings(pet_id,seller_id,opening_bid,reserve_bid,ends_at)
    values(p_id,actor,p_points,p_reserve,clock_timestamp()+make_interval(hours => p_hours)) on conflict (pet_id,seller_id) do nothing;
    if not found then raise exception 'This yokai is already listed.'; end if;
    return;
  end if;

  select * into listing from private.yokai_pound_listings where id=p_id for update;
  if not found then raise exception 'This listing is no longer available.'; end if;

  if p_action = 'expire' then
    if actor <> listing.seller_id or listing.ends_at is null or listing.ends_at > clock_timestamp() then return; end if;
    if listing.bidder_id is null or listing.bid_points < coalesce(listing.reserve_bid,listing.opening_bid) then
      delete from private.yokai_pound_listings where id=p_id;
      return;
    end if;
  elsif listing.ends_at <= clock_timestamp() then
    raise exception 'This listing has ended.';
  end if;

  if p_action = 'cancel' and actor = listing.seller_id then
    delete from private.yokai_pound_listings where id=p_id;
    return;
  elsif p_action = 'withdraw' and actor = listing.bidder_id then
    update private.yokai_pound_listings set bidder_id=null,bid_points=null where id=p_id;
    return;
  elsif p_action = 'bid' and actor <> listing.seller_id and listing.opening_bid > 0 then
    if p_points is null or p_points not between listing.opening_bid and 10000000
       or (listing.bidder_id is not null and p_points <= listing.bid_points) then
      raise exception 'Enter a bid that meets the opening price and beats the current bid.';
    end if;
    adopter := actor;
    price := p_points;
  elsif p_action = 'adopt' and actor <> listing.seller_id and listing.opening_bid = 0 then
    adopter := actor;
    price := 0;
  elsif actor = listing.seller_id and listing.bidder_id is not null and
    (p_action = 'expire' or (p_action = 'settle' and listing.ends_at is null)) then
    adopter := listing.bidder_id;
    price := listing.bid_points;
    if p_action = 'settle' and p_points is distinct from price then raise exception 'The highest bid changed. Refresh the listings and try again.'; end if;
  else
    raise exception 'This action is unavailable for the listing.';
  end if;

  perform 1 from public.profiles where id in (adopter,listing.seller_id) order by id for update;
  if private.yokai_pound_blocked(adopter,listing.seller_id) then raise exception using errcode = 'PYP01', message = 'This transfer is unavailable.'; end if;
  perform 1 from public.user_pets where id=listing.pet_id and owner_id=listing.seller_id for update;
  if not found then raise exception using errcode = 'PYP01', message = 'The seller no longer owns this yokai.'; end if;
  if (select count(*) from public.user_pets where owner_id=adopter) >= 5 then raise exception using errcode = 'PYP01', message = 'The adopter has reached the five-yokai limit.'; end if;
  if price > 0 and (select coalesce(sum(amount),0) from public.global_wallet_transactions where user_id=adopter) < price then
    raise exception using errcode = 'PYP01', message = 'The bidder does not have enough points.';
  end if;
  if p_action = 'bid' then
    update private.yokai_pound_listings set bidder_id=adopter,bid_points=price where id=p_id;
    return;
  end if;

  delete from public.user_pet_equipment where pet_id=listing.pet_id;
  update public.user_pets set owner_id=adopter,is_favorite=false,updated_at=now() where id=listing.pet_id;
  if price > 0 then
    insert into public.global_wallet_transactions(user_id,amount,transaction_type,source_id,description)
    values (adopter,-price,'purchase','yokai-pound:'||p_id,'Yokai Pound auction purchase'),
           (listing.seller_id,price,'earn','yokai-pound:'||p_id,'Yokai Pound auction sale');
  end if;
  delete from private.yokai_pound_listings where pet_id=listing.pet_id and seller_id=listing.seller_id;
end;
$function$;
revoke all on function private.manage_yokai_pound(uuid,text,uuid,integer,integer,integer) from public, anon, authenticated;

create or replace function public.manage_yokai_pound(p_action text, p_id uuid, p_points integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_action = 'expire' then raise exception 'This action is unavailable for the listing.'; end if;
  perform private.manage_yokai_pound(auth.uid(),p_action,p_id,p_points,null,null);
end;
$$;

create function public.create_timed_yokai_pound_listing(p_id uuid, p_points integer, p_reserve integer, p_hours integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_hours is null then raise exception 'Choose a listing duration.'; end if;
  perform private.manage_yokai_pound(auth.uid(),'list',p_id,p_points,p_reserve,p_hours);
end;
$$;

CREATE OR REPLACE FUNCTION public.list_yokai_pound_timed(p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, pet_id uuid, nickname text, level integer, species text, slug text, seller text, mine boolean, is_high_bidder boolean, opening_bid integer, bid_points integer, reserve_bid integer, ends_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.id, p.id, p.nickname, p.level, s.name, s.slug, seller.username,
    l.seller_id = auth.uid(), coalesce(l.bidder_id = auth.uid(),false), l.opening_bid,
    case when l.bidder_id is not null then l.bid_points end, l.reserve_bid, l.ends_at
  from private.yokai_pound_listings l
  join public.user_pets p on p.id=l.pet_id and p.owner_id=l.seller_id
  join public.pet_species s on s.id=p.species_id
  join public.profiles seller on seller.id=l.seller_id
  where auth.uid() is not null and not private.yokai_pound_blocked(auth.uid(),l.seller_id)
    and (l.ends_at is null or l.ends_at > statement_timestamp())
  order by l.created_at desc, l.id
  limit 30 offset greatest(p_offset,0);
$function$;
revoke all on function public.create_timed_yokai_pound_listing(uuid,integer,integer,integer), public.list_yokai_pound_timed(integer) from public, anon;
grant execute on function public.create_timed_yokai_pound_listing(uuid,integer,integer,integer), public.list_yokai_pound_timed(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.list_yokai_pound(p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, pet_id uuid, nickname text, level integer, species text, slug text, seller text, mine boolean, is_high_bidder boolean, opening_bid integer, bid_points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select l.id, p.id, p.nickname, p.level, s.name, s.slug, seller.username,
    l.seller_id = auth.uid(), coalesce(l.bidder_id = auth.uid(),false), l.opening_bid,
    case when l.bidder_id is not null then l.bid_points end
  from private.yokai_pound_listings l
  join public.user_pets p on p.id=l.pet_id and p.owner_id=l.seller_id
  join public.pet_species s on s.id=p.species_id
  join public.profiles seller on seller.id=l.seller_id
  where auth.uid() is not null and not private.yokai_pound_blocked(auth.uid(),l.seller_id)
    and (l.ends_at is null or l.ends_at > statement_timestamp())
  order by l.created_at desc, l.id
  limit 30 offset greatest(p_offset,0);
$function$;

create function private.expire_yokai_pound_listings()
returns void language plpgsql set search_path = '' as $$
declare
  listing record;
begin
  for listing in
    select id, seller_id from private.yokai_pound_listings
    where ends_at <= clock_timestamp()
    order by ends_at, id
    limit 100
    for update skip locked
  loop
    begin
      perform private.manage_yokai_pound(listing.seller_id,'expire',listing.id,null,null,null);
    exception when sqlstate 'PYP01' then
      delete from private.yokai_pound_listings where id=listing.id;
    end;
  end loop;
end;
$$;
revoke all on function private.expire_yokai_pound_listings() from public, anon, authenticated;

select cron.schedule('expire-yokai-pound-listings','* * * * *','select private.expire_yokai_pound_listings()');

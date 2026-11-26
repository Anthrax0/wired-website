alter table private.yokai_pound_listings
  add column exchange_min_level integer check (exchange_min_level between 1 and 99),
  add column exchange_species_id uuid references public.pet_species(id),
  add column exchange_rarity text check (exchange_rarity in ('common','uncommon','rare','epic','legendary','mythical')),
  add constraint yokai_exchange_terms check (
    (exchange_min_level is null and exchange_species_id is null and exchange_rarity is null)
    or (exchange_min_level is not null and opening_bid=0 and bidder_id is null and bid_points is null and ends_at is not null)
  );

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
    and l.exchange_min_level is null
  order by l.created_at desc, l.id
  limit 30 offset greatest(p_offset,0);
$function$;

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
    and l.exchange_min_level is null
  order by l.created_at desc, l.id
  limit 30 offset greatest(p_offset,0);
$function$;

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

  if listing.exchange_min_level is not null and p_action not in ('cancel','expire') then
    raise exception 'Use a matching companion for this adoption exchange.';
  end if;

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

-- Check ownership changes after the full statement, so swaps do not count as a net gain.
create function private.enforce_yokai_transfer_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient uuid;
begin
  for recipient in
    select n.owner_id from new_pets n join old_pets o using (id)
    where n.owner_id is distinct from o.owner_id
    group by n.owner_id
    having count(*) > (select count(*) from old_pets departed join new_pets replacement using (id)
      where departed.owner_id=n.owner_id and replacement.owner_id is distinct from departed.owner_id)
    order by n.owner_id
  loop
    perform 1 from public.profiles where id=recipient for no key update;
    if (select count(*) from public.user_pets where owner_id=recipient)>5 then
      raise exception 'You can own up to 5 yokai companions. Free a spot before adding another.';
    end if;
  end loop;
  return null;
end;
$$;
revoke all on function private.enforce_yokai_transfer_limit() from public, anon, authenticated;

drop trigger wired_yokai_ownership_limit on public.user_pets;
create trigger wired_yokai_ownership_limit before insert on public.user_pets
for each row execute function private.wired_enforce_yokai_ownership_limit();
create trigger wired_yokai_transfer_limit after update on public.user_pets
referencing old table as old_pets new table as new_pets
for each statement execute function private.enforce_yokai_transfer_limit();

create function public.list_yokai_adoption_exchanges(p_offset integer default 0)
returns table(id uuid, nickname text, level integer, species text, slug text, owner_name text, mine boolean,
  requested_species_id uuid, requested_species text, requested_rarity text, minimum_level integer, ends_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select l.id,p.nickname,p.level,s.name,s.slug,owner.username,l.seller_id=auth.uid(),
    wanted.id,wanted.name,l.exchange_rarity,l.exchange_min_level,l.ends_at
  from private.yokai_pound_listings l
  join public.user_pets p on p.id=l.pet_id and p.owner_id=l.seller_id
  join public.pet_species s on s.id=p.species_id
  join public.profiles owner on owner.id=l.seller_id
  left join public.pet_species wanted on wanted.id=l.exchange_species_id
  where auth.uid() is not null and l.exchange_min_level is not null and l.ends_at > statement_timestamp()
    and not private.yokai_pound_blocked(auth.uid(),l.seller_id)
  order by l.created_at desc,l.id
  limit 30 offset greatest(p_offset,0);
$$;

create function public.create_yokai_adoption_exchange(
  p_pet uuid,p_species uuid,p_rarity text,p_level integer,p_hours integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in to list an exchange.'; end if;
  if p_level is null or p_level not between 1 and 99 or p_hours is null or p_hours not between 1 and 168 then
    raise exception 'Choose a minimum level and listing duration.';
  end if;
  if p_rarity is not null and p_rarity not in ('common','uncommon','rare','epic','legendary','mythical') then
    raise exception 'Choose a valid rarity.';
  end if;
  if p_species is not null and not exists(
    select 1 from public.pet_species s where s.id=p_species and (p_rarity is null or s.rarity=p_rarity)
  ) then raise exception 'Choose a yokai type and rarity that match.'; end if;
  perform 1 from public.user_pets where id=p_pet and owner_id=actor for update;
  if not found then raise exception 'You can only list a companion you own.'; end if;
  insert into private.yokai_pound_listings(pet_id,seller_id,opening_bid,exchange_species_id,exchange_rarity,exchange_min_level,ends_at)
  values(p_pet,actor,0,p_species,p_rarity,p_level,clock_timestamp()+make_interval(hours=>p_hours))
  on conflict (pet_id,seller_id) do nothing;
  if not found then raise exception 'This companion already has an open listing.'; end if;
end;
$$;

create function public.accept_yokai_adoption_exchange(p_listing uuid,p_pet uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  listing private.yokai_pound_listings%rowtype;
begin
  if actor is null then raise exception 'Sign in to exchange companions.'; end if;
  select * into listing from private.yokai_pound_listings where id=p_listing and exchange_min_level is not null for update;
  if not found or listing.seller_id=actor then raise exception 'This exchange is unavailable.'; end if;
  perform 1 from public.profiles where id in (actor,listing.seller_id) order by id for update;
  perform 1 from public.user_pets where id in (p_pet,listing.pet_id) order by id for update;
  if listing.ends_at <= clock_timestamp() or private.yokai_pound_blocked(actor,listing.seller_id)
    or not exists(select 1 from public.user_pets where id=listing.pet_id and owner_id=listing.seller_id) then
    raise exception 'This exchange is unavailable.';
  end if;
  if not exists (
    select 1 from public.user_pets p join public.pet_species s on s.id=p.species_id
    where p.id=p_pet and p.owner_id=actor and p.level>=listing.exchange_min_level
      and (listing.exchange_species_id is null or p.species_id=listing.exchange_species_id)
      and (listing.exchange_rarity is null or s.rarity=listing.exchange_rarity)
  ) then raise exception 'Choose a companion you own that matches the exchange request.'; end if;
  if exists(select 1 from private.yokai_pound_listings where pet_id=p_pet and seller_id=actor) then
    raise exception 'Close your companion’s current listing before exchanging them.';
  end if;

  delete from public.user_pet_equipment where pet_id in (listing.pet_id,p_pet);
  update public.user_pets
    set owner_id=case when id=p_pet then listing.seller_id else actor end,
        is_favorite=false,updated_at=now()
    where id in (listing.pet_id,p_pet);
  delete from private.yokai_pound_listings where id=p_listing;
end;
$$;

revoke all on function public.list_yokai_adoption_exchanges(integer),
  public.create_yokai_adoption_exchange(uuid,uuid,text,integer,integer),
  public.accept_yokai_adoption_exchange(uuid,uuid) from public,anon;
grant execute on function public.list_yokai_adoption_exchanges(integer),
  public.create_yokai_adoption_exchange(uuid,uuid,text,integer,integer),
  public.accept_yokai_adoption_exchange(uuid,uuid) to authenticated;

create table private.yokai_pound_listings (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references public.user_pets(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  opening_bid integer not null check (opening_bid between 0 and 10000000),
  bidder_id uuid references public.profiles(id) on delete set null,
  bid_points integer,
  created_at timestamptz not null default now(),
  unique (pet_id, seller_id)
);

alter table private.yokai_pound_listings enable row level security;

create function private.yokai_pound_blocked(a uuid, b uuid)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.blocks where (blocker_id,blocked_id) in ((a,b),(b,a))
    union all
    select 1 from public.wired_user_blocks where (blocker_id,blocked_id) in ((a,b),(b,a))
  );
$$;
revoke all on function private.yokai_pound_blocked(uuid,uuid) from public, anon, authenticated;

create function public.list_yokai_pound(p_offset integer default 0)
returns table (id uuid, pet_id uuid, nickname text, level integer, species text, slug text,
  seller text, mine boolean, is_high_bidder boolean, opening_bid integer, bid_points integer)
language sql stable security definer set search_path = '' as $$
  select l.id, p.id, p.nickname, p.level, s.name, s.slug, seller.username,
    l.seller_id = auth.uid(), coalesce(l.bidder_id = auth.uid(),false), l.opening_bid,
    case when l.bidder_id is not null then l.bid_points end
  from private.yokai_pound_listings l
  join public.user_pets p on p.id=l.pet_id and p.owner_id=l.seller_id
  join public.pet_species s on s.id=p.species_id
  join public.profiles seller on seller.id=l.seller_id
  where auth.uid() is not null and not private.yokai_pound_blocked(auth.uid(),l.seller_id)
  order by l.created_at desc, l.id
  limit 30 offset greatest(p_offset,0);
$$;
revoke all on function public.list_yokai_pound(integer) from public, anon;
grant execute on function public.list_yokai_pound(integer) to authenticated;

create function public.manage_yokai_pound(p_action text, p_id uuid, p_points integer default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  listing private.yokai_pound_listings%rowtype;
  adopter uuid;
  price integer;
begin
  if actor is null then raise exception 'Sign in to use Yokai Pound.'; end if;
  if p_action = 'list' then
    if p_points is null or p_points not between 0 and 10000000 then raise exception 'Enter a valid opening bid.'; end if;
    perform 1 from public.user_pets where id=p_id and owner_id=actor for update;
    if not found then raise exception 'You can only list a yokai you own.'; end if;
    if exists (select 1 from private.yokai_pound_listings where pet_id=p_id and seller_id=actor) then
      raise exception 'This yokai is already listed.';
    end if;
    insert into private.yokai_pound_listings(pet_id,seller_id,opening_bid)
    values(p_id,actor,p_points) on conflict (pet_id,seller_id) do nothing;
    if not found then raise exception 'This yokai is already listed.'; end if;
    return;
  end if;

  select * into listing from private.yokai_pound_listings where id=p_id for update;
  if not found then raise exception 'This listing is no longer available.'; end if;

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
  elsif p_action = 'settle' and actor = listing.seller_id and listing.bidder_id is not null then
    adopter := listing.bidder_id;
    price := listing.bid_points;
    if p_points is distinct from price then raise exception 'The highest bid changed. Refresh the listings and try again.'; end if;
  else
    raise exception 'This action is unavailable for the listing.';
  end if;

  perform 1 from public.profiles where id in (adopter,listing.seller_id) order by id for update;
  if private.yokai_pound_blocked(adopter,listing.seller_id) then raise exception 'This transfer is unavailable.'; end if;
  perform 1 from public.user_pets where id=listing.pet_id and owner_id=listing.seller_id for update;
  if not found then raise exception 'The seller no longer owns this yokai.'; end if;
  if (select count(*) from public.user_pets where owner_id=adopter) >= 5 then raise exception 'The adopter has reached the five-yokai limit.'; end if;
  if price > 0 and (select coalesce(sum(amount),0) from public.global_wallet_transactions where user_id=adopter) < price then
    raise exception 'The bidder does not have enough points.';
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
$$;
revoke all on function public.manage_yokai_pound(text,uuid,integer) from public, anon;
grant execute on function public.manage_yokai_pound(text,uuid,integer) to authenticated;

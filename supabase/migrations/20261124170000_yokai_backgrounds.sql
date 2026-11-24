alter table public.user_pet_equipment drop constraint user_pet_equipment_slot_check, add constraint user_pet_equipment_slot_check check (slot in ('head','neck','toy','home','background'));

create function public.purchase_my_yokai_background(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Please log in first.'; end if;
  perform 1 from public.profiles where id=v_owner for update;
  if not found then raise exception 'Member account not found.'; end if;
  perform 1 from public.global_store_items where id=p_item_id and category='Yokai Backgrounds' and active for share;
  if not found then raise exception 'This background is unavailable.'; end if;
  if exists (select 1 from public.global_store_purchases where user_id=v_owner and item_id=p_item_id) then
    return jsonb_build_object('already_owned',true);
  end if;
  return public.purchase_global_store_item(v_owner,p_item_id);
end;
$$;

create function public.set_my_yokai_background(p_pet_id uuid,p_item_id uuid,p_expected_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid();
begin
  if v_owner is null then raise exception 'Please log in first.'; end if;
  -- Recycling locks this same purchase before clearing the equipment.
  if p_item_id is not null then
    perform 1 from public.global_store_purchases p
    join public.global_store_items i on i.id=p.item_id
    where p.user_id=v_owner and p.item_id=p_item_id and i.category='Yokai Backgrounds'
    for key share of p;
    if not found then raise exception 'Purchase this background before equipping it.'; end if;
  end if;
  perform 1 from public.user_pets where id=p_pet_id and owner_id=v_owner for update;
  if not found then raise exception 'That yokai does not belong to you.'; end if;
  if p_item_id is null then
    delete from public.user_pet_equipment where pet_id=p_pet_id and owner_id=v_owner
      and slot='background' and item_id=p_expected_item_id;
  else
    insert into public.user_pet_equipment(owner_id,pet_id,slot,item_id)
    values(v_owner,p_pet_id,'background',p_item_id)
    on conflict (pet_id,slot) do update set item_id=excluded.item_id,owner_id=excluded.owner_id,equipped_at=now();
  end if;
end;
$$;

create function public.my_yokai_backgrounds()
returns table(pet_id uuid,item_id uuid,sku text)
language sql stable security definer set search_path = '' as $$
  select e.pet_id,e.item_id,i.sku
  from public.user_pet_equipment e
  join public.user_pets p on p.id=e.pet_id and p.owner_id=e.owner_id
  join public.global_store_items i on i.id=e.item_id
  where e.owner_id=(select auth.uid()) and e.slot='background';
$$;

revoke execute on function public.purchase_my_yokai_background(uuid),public.set_my_yokai_background(uuid,uuid,uuid),public.my_yokai_backgrounds() from public,anon;
grant execute on function public.purchase_my_yokai_background(uuid),public.set_my_yokai_background(uuid,uuid,uuid),public.my_yokai_backgrounds() to authenticated;

CREATE OR REPLACE FUNCTION public.profile_bonded_companion(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when u.id is null then null::jsonb else
 jsonb_build_object('id',u.id,'nickname',u.nickname,'level',u.level,'pet_key',s.slug,'display_name',s.name,'rarity',s.rarity,'background_sku',b.sku)
 end
 from public.profiles p
 left join public.user_pets u on u.id=p.equipped_companion_pet_id and u.owner_id=p.id
 left join public.pet_species s on s.id=u.species_id
 left join public.user_pet_equipment e on e.pet_id=u.id and e.owner_id=u.owner_id and e.slot='background'
 left join public.global_store_items b on b.id=e.item_id
 where p.id=p_profile_id and auth.uid() is not null
 limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.my_bonded_companion()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when u.id is null then null::jsonb else
 jsonb_build_object('id',u.id,'nickname',u.nickname,'level',u.level,'pet_key',s.slug,'display_name',s.name,'rarity',s.rarity,'background_sku',b.sku)
 end
 from public.profiles p
 left join public.user_pets u on u.id=p.equipped_companion_pet_id and u.owner_id=p.id
 left join public.pet_species s on s.id=u.species_id
 left join public.user_pet_equipment e on e.pet_id=u.id and e.owner_id=u.owner_id and e.slot='background'
 left join public.global_store_items b on b.id=e.item_id
 where p.id=(select auth.uid())
 limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.community_profile_global_companion(p_community_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select case when u.id is null then null::jsonb else jsonb_build_object('id',u.id,'nickname',u.nickname,'level',u.level,'pet_key',s.slug,'display_name',s.name,'rarity',s.rarity,'background_sku',b.sku) end
 from public.community_profiles cp
 join public.profiles p on p.id=cp.user_id
 left join public.user_pets u on u.id=p.equipped_companion_pet_id and u.owner_id=p.id
 left join public.pet_species s on s.id=u.species_id
 left join public.user_pet_equipment e on e.pet_id=u.id and e.owner_id=u.owner_id and e.slot='background'
 left join public.global_store_items b on b.id=e.item_id
 where cp.community_id=p_community_id and cp.user_id=p_user_id and cp.show_global_companion=true
 and auth.uid() is not null
 and (public.is_community_member(p_community_id) or exists(select 1 from public.communities c where c.id=p_community_id and c.owner_id=auth.uid()))
 limit 1
$function$
;

insert into public.global_store_items (sku,name,description,category,image_url,price_points,active,sort_order) values
  ('yokai-bg-haunted-hollow','Haunted Hollow','A moonlit hollow where crooked trees crowd the path.','Yokai Backgrounds','assets/yokai-backgrounds/haunted-hollow.webp',250,true,200),
  ('yokai-bg-crimson-graveyard','Crimson Graveyard','Weathered headstones beneath a blood-red moon.','Yokai Backgrounds','assets/yokai-backgrounds/crimson-graveyard.webp',350,true,201),
  ('yokai-bg-forsaken-shrine','Forsaken Shrine','An abandoned shrine guarded by shadows.','Yokai Backgrounds','assets/yokai-backgrounds/forsaken-shrine.webp',500,true,202),
  ('yokai-bg-cursed-marsh','Cursed Marsh','Cold lights drift across a drowned trail.','Yokai Backgrounds','assets/yokai-backgrounds/cursed-marsh.webp',350,true,203),
  ('yokai-bg-infernal-abyss','Infernal Abyss','Black cliffs descend into rivers of fire.','Yokai Backgrounds','assets/yokai-backgrounds/infernal-abyss.webp',750,true,204),
  ('yokai-bg-eternal-void','Eternal Void','A starless expanse where the light falls away.','Yokai Backgrounds','assets/yokai-backgrounds/eternal-void.webp',1000,true,205),
  ('yokai-bg-abandoned-asylum','Abandoned Asylum','A derelict corridor with one light still burning.','Yokai Backgrounds','assets/yokai-backgrounds/abandoned-asylum.webp',450,true,206),
  ('yokai-bg-unholy-cathedral','Unholy Cathedral','Dark stained glass towers over a desecrated altar.','Yokai Backgrounds','assets/yokai-backgrounds/unholy-cathedral.webp',650,true,207),
  ('yokai-bg-forest-of-whispers','Forest of Whispers','Fog winds through trees that seem to listen.','Yokai Backgrounds','assets/yokai-backgrounds/forest-of-whispers.webp',400,true,208),
  ('yokai-bg-frozen-wasteland','Frozen Wasteland','A dead, frozen plain disappears into pale mist.','Yokai Backgrounds','assets/yokai-backgrounds/frozen-wasteland.webp',500,true,209),
  ('yokai-bg-forgotten-catacombs','Forgotten Catacombs','Cracked passageways lead beneath the tombs.','Yokai Backgrounds','assets/yokai-backgrounds/forgotten-catacombs.webp',600,true,210),
  ('yokai-bg-village-of-the-vanished','Village of the Vanished','Low lanterns burn in an empty village.','Yokai Backgrounds','assets/yokai-backgrounds/village-of-the-vanished.webp',550,true,211),
  ('yokai-bg-drowned-shores','Drowned Shores','A black tide breaks over the ruins of a coastal town.','Yokai Backgrounds','assets/yokai-backgrounds/drowned-shores.webp',450,true,212),
  ('yokai-bg-garden-of-thorns','Garden of Thorns','Knotted briars close around a ruined path.','Yokai Backgrounds','assets/yokai-backgrounds/garden-of-thorns.webp',600,true,213),
  ('yokai-bg-ruins-of-damnation','Ruins of Damnation','Jagged walls loom above a fallen stronghold.','Yokai Backgrounds','assets/yokai-backgrounds/ruins-of-damnation.webp',800,true,214),
  ('yokai-bg-river-of-lost-souls','River of Lost Souls','Pale lights drift downstream into the dark.','Yokai Backgrounds','assets/yokai-backgrounds/river-of-lost-souls.webp',850,true,215),
  ('yokai-bg-the-watching-void','The Watching Void','Distant eyes stare from the black.','Yokai Backgrounds','assets/yokai-backgrounds/the-watching-void.webp',1250,true,216),
  ('yokai-bg-realm-of-the-damned','Realm of the Damned','A ruined kingdom under a burning sky.','Yokai Backgrounds','assets/yokai-backgrounds/realm-of-the-damned.webp',1500,true,217),
  ('yokai-bg-yetis-whiteout','Yeti’s Whiteout','A violent alpine snowstorm swallows the mountain pass.','Yokai Backgrounds','assets/yokai-backgrounds/yetis-whiteout.webp',2000,true,218),
  ('yokai-bg-sasquatchs-blackwood','Sasquatch’s Blackwood','Dense old-growth forest closes in beneath low, cold mist.','Yokai Backgrounds','assets/yokai-backgrounds/sasquatchs-blackwood.webp',2000,true,219)
on conflict (sku) do update set name=excluded.name,description=excluded.description,category=excluded.category,image_url=excluded.image_url,price_points=excluded.price_points,active=excluded.active,sort_order=excluded.sort_order;

update public.global_store_items set active=false where category in ('Yokai Accessories','Yokai Toys','Yokai Homes','Yokai Collectibles','Pet Accessories','Pet Toys','Pet Homes');
CREATE OR REPLACE FUNCTION public.equip_pet_store_item(p_pet_id uuid, p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_owner uuid := auth.uid(); v_slot text; v_category text;
begin
 if v_owner is null then raise exception 'Please log in first.'; end if;
 if not exists(select 1 from public.user_pets where id=p_pet_id and owner_id=v_owner) then
   raise exception 'That yokai does not belong to you.';
 end if;
 select category,
   case when sku like 'pet-ear-%' or sku like 'pet-bunny-%' or sku like 'pet-rainbow-%' then 'head'
        when sku like 'pet-%collar' then 'neck'
        when category in ('Yokai Toys','Pet Toys') then 'toy'
        when category in ('Yokai Homes','Pet Homes') then 'home'
        else null end
 into v_category,v_slot
 from public.global_store_items where id=p_item_id;
 if v_slot is null or v_category not in ('Yokai Accessories','Yokai Toys','Yokai Homes','Pet Accessories','Pet Toys','Pet Homes') then
   raise exception 'That item cannot be equipped to a yokai.';
 end if;
 if not exists(select 1 from public.global_store_purchases where user_id=v_owner and item_id=p_item_id) then
   raise exception 'Purchase this item before equipping it.';
 end if;
 insert into public.user_pet_equipment(owner_id,pet_id,slot,item_id)
 values(v_owner,p_pet_id,v_slot,p_item_id)
 on conflict (pet_id,slot) do update set item_id=excluded.item_id,equipped_at=now();
 return jsonb_build_object('ok',true,'slot',v_slot);
end;
$function$
;


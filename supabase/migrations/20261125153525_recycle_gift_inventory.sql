create function public.recycle_my_inventory_gift(p_gift_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  gift public.global_friend_gifts%rowtype;
  refund integer;
begin
  if owner_id is null then raise exception 'Please log in first.'; end if;

  -- Serialize against sending or recycling the same inventory gift.
  delete from public.global_friend_gifts
  where id = p_gift_id and sender_id = owner_id and status in ('inventory', 'rejected')
  returning * into gift;
  if not found then raise exception 'This gift is no longer in your inventory.'; end if;

  refund := gift.base_points / 4;
  if refund > 0 then
    insert into public.global_wallet_transactions
      (user_id, amount, transaction_type, source_id, description)
    values (owner_id, refund, 'recycle', 'recycle:gift:' || gift.id::text,
      'Recycled ' || gift.gift_name || ' (25% refund)');
  end if;

  return jsonb_build_object('refund', refund);
end;
$$;

revoke execute on function public.recycle_my_inventory_gift(uuid) from public, anon;
grant execute on function public.recycle_my_inventory_gift(uuid) to authenticated;

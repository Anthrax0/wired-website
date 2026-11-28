create function private.clear_transferred_yokai_background()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_pet_equipment
  where pet_id = old.id and slot = 'background';
  return new;
end;
$$;

revoke all on function private.clear_transferred_yokai_background() from public, anon, authenticated;

create trigger clear_transferred_yokai_background
after update of owner_id on public.user_pets
for each row
when (old.owner_id is distinct from new.owner_id)
execute function private.clear_transferred_yokai_background();

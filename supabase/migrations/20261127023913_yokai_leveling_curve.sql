alter table public.user_pets
  add column level_xp integer not null default 0 check (level_xp >= 0),
  add column xp_to_next_level integer generated always as (
    case when level < 99 then 30 + (level - 1) * 5 else 0 end
  ) stored;

-- Keep the existing level and lifetime XP. Map the old progress fraction
-- onto the new requirement with integer rounding down.
update public.user_pets
set level_xp = (xp % 100) * xp_to_next_level / 100
where xp % 100 <> 0 and xp_to_next_level > 0;

create function private.apply_yokai_leveling_curve()
returns trigger language plpgsql set search_path = '' as $$
declare
  progress bigint;
  required_xp integer := old.xp_to_next_level;
begin
  -- Older award functions still supply a level based on lifetime XP.
  -- Resolve all awards from the stored level and the XP added by this update.
  new.level := old.level;
  progress := old.level_xp::bigint + new.xp - old.xp;
  while new.level < 99 and progress >= required_xp loop
    progress := progress - required_xp;
    new.level := new.level + 1;
    required_xp := required_xp + 5;
  end loop;
  new.level_xp := case when new.level >= 99 then 0 else greatest(0, progress) end;
  return new;
end
$$;
revoke all on function private.apply_yokai_leveling_curve() from public, anon, authenticated;

create trigger apply_yokai_leveling_curve
before update of xp on public.user_pets
for each row when (old.xp is distinct from new.xp)
execute function private.apply_yokai_leveling_curve();

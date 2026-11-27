alter table public.user_pets
  alter column xp_to_next_level set expression as (
    case when level < 99 then 60 + (level - 1) * 10 else 0 end
  );

-- Preserve the fraction completed at the current level and leave lifetime XP alone.
update public.user_pets
set level_xp = level_xp * 2
where level < 99 and level_xp > 0;

create or replace function private.apply_yokai_leveling_curve()
returns trigger language plpgsql set search_path = '' as $$
declare
  progress bigint;
  required_xp integer := old.xp_to_next_level;
begin
  new.level := old.level;
  progress := old.level_xp::bigint + new.xp - old.xp;
  while new.level < 99 and progress >= required_xp loop
    progress := progress - required_xp;
    new.level := new.level + 1;
    required_xp := required_xp + 10;
  end loop;
  new.level_xp := case when new.level >= 99 then 0 else greatest(0, progress) end;
  return new;
end
$$;

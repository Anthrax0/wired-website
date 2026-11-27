alter table public.user_pets
  add column is_test_subject boolean not null default false;

comment on column public.user_pets.is_test_subject is
  'Staff-assigned label for a companion designated for testing.';
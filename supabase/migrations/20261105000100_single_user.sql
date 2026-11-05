-- Single-player: only the owner's email may create an account.
create or replace function public.only_owner_signup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(new.email) <> 'justin@automaticdesigns.co' then
    raise exception 'sign-ups are closed';
  end if;
  return new;
end $$;
revoke execute on function public.only_owner_signup() from public, anon, authenticated;

drop trigger if exists only_owner_signup on auth.users;
create trigger only_owner_signup before insert on auth.users
  for each row execute function public.only_owner_signup();

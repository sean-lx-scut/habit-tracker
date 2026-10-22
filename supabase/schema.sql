-- 微习惯 Supabase 数据库初始化脚本
-- 在 Supabase Dashboard -> SQL Editor 中一次性执行本文件。

create extension if not exists pgcrypto;

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  emoji text not null default '🌱' check (char_length(emoji) between 1 and 16),
  color text not null default 'sage'
    check (color in ('sage', 'sun', 'coral', 'sky', 'lavender', 'ink')),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  checked_date date not null,
  created_at timestamptz not null default now(),
  constraint check_ins_habit_date_unique unique (habit_id, checked_date)
);

create index if not exists habits_user_order_idx
  on public.habits (user_id, position, created_at);

create index if not exists check_ins_user_date_idx
  on public.check_ins (user_id, checked_date);

create index if not exists check_ins_habit_date_idx
  on public.check_ins (habit_id, checked_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists habits_set_updated_at on public.habits;
create trigger habits_set_updated_at
before update on public.habits
for each row
execute function public.set_updated_at();

alter table public.habits enable row level security;
alter table public.check_ins enable row level security;

revoke all on table public.habits from anon;
revoke all on table public.check_ins from anon;
revoke all on table public.habits from public;
revoke all on table public.check_ins from public;
grant select, insert, update, delete on table public.habits to authenticated;
grant select, insert, update, delete on table public.check_ins to authenticated;

drop policy if exists "habits_select_own" on public.habits;
create policy "habits_select_own"
on public.habits
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "habits_insert_own" on public.habits;
create policy "habits_insert_own"
on public.habits
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "habits_update_own" on public.habits;
create policy "habits_update_own"
on public.habits
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "habits_delete_own" on public.habits;
create policy "habits_delete_own"
on public.habits
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "check_ins_select_own" on public.check_ins;
create policy "check_ins_select_own"
on public.check_ins
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "check_ins_insert_own_habit" on public.check_ins;
create policy "check_ins_insert_own_habit"
on public.check_ins
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.habits
    where public.habits.id = check_ins.habit_id
      and public.habits.user_id = auth.uid()
  )
);

drop policy if exists "check_ins_delete_own" on public.check_ins;
create policy "check_ins_delete_own"
on public.check_ins
for delete
to authenticated
using (auth.uid() = user_id);

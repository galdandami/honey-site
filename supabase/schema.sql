-- =============================================================
--  Мёд Камского Устья — схема Supabase
--  Выполните весь скрипт в SQL Editor вашего проекта Supabase
--  (одним блоком, кнопка Run).
-- =============================================================

-- 1) Таблица с содержимым сайта (всегда одна строка, id = 1)
create table if not exists public.site_content (
  id         smallint primary key default 1 check (id = 1),
  texts      jsonb not null default '{}'::jsonb,
  price      integer,
  jars       jsonb not null default '{}'::jsonb,
  extras     jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Секретный ключ редактора (используется админкой при записи)
create table if not exists public.meta (
  key   text primary key,
  value text not null
);

-- Поменяйте значение на свой секрет, если хотите
insert into public.meta (key, value)
values ('editor_secret', 'CHANGE_ME')
on conflict (key) do nothing;

-- 3) Функция сохранения контента: проверяет секрет и пишет одну строку
--    jars — цены и остатки по банкам: {"1": {"price": 750, "stock": 100}, ...}
create or replace function public.save_content(
  p_texts   jsonb,
  p_price   integer,
  p_jars    jsonb,
  p_extras  jsonb,
  p_secret  text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected text;
begin
  select value into v_expected from public.meta where key = 'editor_secret';
  if v_expected is null or p_secret is null or p_secret <> v_expected then
    raise exception 'Неверный ключ редактора';
  end if;

  insert into public.site_content (id, texts, price, jars, extras, updated_at)
  values (
    1,
    coalesce(p_texts, '{}'::jsonb),
    p_price,
    coalesce(p_jars, '{}'::jsonb),
    coalesce(p_extras, '[]'::jsonb),
    now()
  )
  on conflict (id) do update
    set texts      = excluded.texts,
        price      = excluded.price,
        jars       = excluded.jars,
        extras     = excluded.extras,
        updated_at = excluded.updated_at;

  return true;
end;
$$;

-- 4) Права доступа
--    Читать контент может любой посетитель сайта
alter table public.site_content enable row level security;
drop policy if exists "site_content_read" on public.site_content;
create policy "site_content_read"
  on public.site_content for select
  to anon
  using (true);

--    Таблицу с секретом закрываем от всех
alter table public.meta enable row level security;
revoke all on public.meta from anon, authenticated;

--    Записывать можно только через функцию save_content с верным секретом
grant select on public.site_content to anon;
grant execute on function public.save_content(jsonb, integer, jsonb, jsonb, text) to anon;

-- =============================================================
-- Начальное содержимое (пустое = сайт использует оригинальные
-- тексты из index.html). Можно не выполнять.
-- =============================================================
insert into public.site_content (id, texts, price, extras, updated_at)
values (1, '{}'::jsonb, null, '[]'::jsonb, now())
on conflict (id) do nothing;
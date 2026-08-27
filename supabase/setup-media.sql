-- Supabase setup for VPlacard media and editable sample recipes.
-- The app is currently client-only, so policies are intentionally open to anon/authenticated roles.
-- Tighten these policies around user ownership before adding real multi-user accounts.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vplacard-media',
  'vplacard-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.image_assets (
  kind text not null check (kind in ('app', 'recipe')),
  image_key text not null,
  path text not null,
  public_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kind, image_key)
);

alter table public.image_assets enable row level security;

grant select, insert, update, delete on public.image_assets to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'image_assets' and policyname = 'image_assets_select_public'
  ) then
    create policy image_assets_select_public
    on public.image_assets
    for select
    to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'image_assets' and policyname = 'image_assets_insert_public'
  ) then
    create policy image_assets_insert_public
    on public.image_assets
    for insert
    to anon, authenticated
    with check (
      kind in ('app', 'recipe')
      and length(image_key) between 1 and 160
      and length(path) between 1 and 500
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'image_assets' and policyname = 'image_assets_update_public'
  ) then
    create policy image_assets_update_public
    on public.image_assets
    for update
    to anon, authenticated
    using (true)
    with check (
      kind in ('app', 'recipe')
      and length(image_key) between 1 and 160
      and length(path) between 1 and 500
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'image_assets' and policyname = 'image_assets_delete_public'
  ) then
    create policy image_assets_delete_public
    on public.image_assets
    for delete
    to anon, authenticated
    using (true);
  end if;
end $$;

create table if not exists public.recipe_overrides (
  recipe_id text primary key,
  name text not null,
  kind text not null check (kind in ('savory', 'sweet')),
  ingredients jsonb not null,
  servings numeric null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.recipe_overrides enable row level security;

grant select, insert, update, delete on public.recipe_overrides to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipe_overrides' and policyname = 'recipe_overrides_select_public'
  ) then
    create policy recipe_overrides_select_public
    on public.recipe_overrides
    for select
    to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipe_overrides' and policyname = 'recipe_overrides_insert_public'
  ) then
    create policy recipe_overrides_insert_public
    on public.recipe_overrides
    for insert
    to anon, authenticated
    with check (
      length(recipe_id) between 1 and 160
      and length(name) between 1 and 180
      and kind in ('savory', 'sweet')
      and jsonb_typeof(ingredients) = 'array'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipe_overrides' and policyname = 'recipe_overrides_update_public'
  ) then
    create policy recipe_overrides_update_public
    on public.recipe_overrides
    for update
    to anon, authenticated
    using (true)
    with check (
      length(recipe_id) between 1 and 160
      and length(name) between 1 and 180
      and kind in ('savory', 'sweet')
      and jsonb_typeof(ingredients) = 'array'
    );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'recipe_overrides' and policyname = 'recipe_overrides_delete_public'
  ) then
    create policy recipe_overrides_delete_public
    on public.recipe_overrides
    for delete
    to anon, authenticated
    using (true);
  end if;
end $$;

alter table public.week_meals enable row level security;

grant select, insert, update, delete on public.week_meals to anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_meals' and policyname = 'week_meals_select_public'
  ) then
    create policy week_meals_select_public
    on public.week_meals
    for select
    to anon, authenticated
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_meals' and policyname = 'week_meals_insert_public'
  ) then
    create policy week_meals_insert_public
    on public.week_meals
    for insert
    to anon, authenticated
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_meals' and policyname = 'week_meals_update_public'
  ) then
    create policy week_meals_update_public
    on public.week_meals
    for update
    to anon, authenticated
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'week_meals' and policyname = 'week_meals_delete_public'
  ) then
    create policy week_meals_delete_public
    on public.week_meals
    for delete
    to anon, authenticated
    using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'vplacard_media_select_public'
  ) then
    create policy vplacard_media_select_public
    on storage.objects
    for select
    to anon, authenticated
    using (bucket_id = 'vplacard-media');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'vplacard_media_insert_public'
  ) then
    create policy vplacard_media_insert_public
    on storage.objects
    for insert
    to anon, authenticated
    with check (
      bucket_id = 'vplacard-media'
      and (storage.foldername(name))[1] in ('app', 'recipes')
    );
  end if;
end $$;

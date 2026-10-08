-- VAYRO veritabanı şeması. Supabase > SQL Editor içine yapıştırıp bir kez çalıştır.

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),

  -- Kullanıcının onayladığı araç bilgileri
  brand text not null,
  model text not null,
  year text default '',
  body_type text default '',
  color_name text default '',
  color_hex text default '',
  wheels text default '',
  headlights text default '',
  distinctive text default '',
  field_source jsonb not null default '{}'::jsonb,   -- alan başına: ai_onayli | kullanici | bos
  ai_result jsonb,                                   -- yapay zekânın ham tahmini ve güven puanları
  user_confirmed boolean not null default false,
  verification text not null default 'ai_gorsel_eslesme', -- sahiplik doğrulaması DEĞİLDİR

  -- Fotoğraf referansları (car-photos kovasındaki yollar)
  photo_paths text[] not null default '{}',

  -- 3D model üretimi
  model_status text not null default 'none' check (model_status in ('none','queued','processing','ready','failed')),
  model_provider text,
  model_task_id text,
  model_progress int not null default 0,
  model_error text,
  model_requested_at timestamptz,
  model_glb_path text,
  model_usdz_path text,
  model_thumb_path text,

  -- Profil
  nickname text not null default '',
  description text not null default '',
  mods text[] not null default '{}',
  visibility text not null default 'private' check (visibility in ('private','public')),
  featured boolean not null default false
);
create index if not exists cars_owner_idx on public.cars (owner_id);
create index if not exists cars_public_idx on public.cars (visibility) where visibility = 'public';

create table if not exists public.likes (
  car_id uuid not null references public.cars (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (car_id, user_id)
);

alter table public.cars enable row level security;
alter table public.likes enable row level security;

drop policy if exists cars_select on public.cars;
create policy cars_select on public.cars for select
  using (visibility = 'public' or owner_id = auth.uid());
drop policy if exists cars_insert on public.cars;
create policy cars_insert on public.cars for insert to authenticated
  with check (owner_id = auth.uid());
drop policy if exists cars_update on public.cars;
create policy cars_update on public.cars for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists cars_delete on public.cars;
create policy cars_delete on public.cars for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select using (true);
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated
  using (user_id = auth.uid());

-- Beğeni sayısıyla birlikte araç listesi. security_invoker: cars tablosunun kuralları aynen geçerli.
create or replace view public.car_feed with (security_invoker = true) as
  select c.*, (select count(*) from public.likes l where l.car_id = c.id)::int as like_count
  from public.cars c;

-- Dosya kovaları: fotoğraflar özel, 3D modeller herkese açık adresle sunulur (yol tahmin edilemez).
insert into storage.buckets (id, name, public) values ('car-photos', 'car-photos', false)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('car-models', 'car-models', true)
  on conflict (id) do nothing;

-- Herkes yalnızca kendi klasörüne (kullanıcı kimliği) yazar ve oradan okur.
drop policy if exists photos_rw on storage.objects;
create policy photos_rw on storage.objects for all to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists models_owner_delete on storage.objects;
create policy models_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'car-models' and (storage.foldername(name))[1] = auth.uid()::text);

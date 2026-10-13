-- ============================================================
--  Pawlo — Supabase Schema
--  Run this in the Supabase Dashboard → SQL Editor
-- ============================================================

-- ── Profiles ─────────────────────────────────────────────────
-- Auto-created for every new auth user via a trigger.

create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  full_name   text,
  phone       text,
  address     text,
  avatar_url  text,
  created_at  timestamptz default now() not null
);

-- Trigger: create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, phone, address, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', ''),
    coalesce(new.raw_user_meta_data ->> 'address', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;

-- Profiles are viewable so users can see pet owners and chat participants
create policy "Anyone can view profiles"
  on public.profiles for select using (true);

-- Users can insert their own profile
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

-- Users can update only their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ── Pet Reports ───────────────────────────────────────────────

create table if not exists public.pet_reports (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  name        text not null,
  species     text not null,
  location    text not null,
  district    text not null default '',
  contact     text not null default '',
  description text,
  status      text not null default 'LOST' check (status in ('LOST', 'FOUND')),
  image_url   text,
  created_at  timestamptz default now() not null
);

-- Index for common query patterns
create index if not exists pet_reports_status_idx    on public.pet_reports (status);
create index if not exists pet_reports_species_idx   on public.pet_reports (species);
create index if not exists pet_reports_district_idx  on public.pet_reports (district);
create index if not exists pet_reports_user_idx      on public.pet_reports (user_id);

-- RLS
alter table public.pet_reports enable row level security;

-- Anyone can read reports (public feed)
create policy "Anyone can view pet reports"
  on public.pet_reports for select using (true);

-- Only authenticated users can create reports
create policy "Authenticated users can create reports"
  on public.pet_reports for insert
  with check (auth.uid() = user_id);

-- Only the owner can update their report, and they cannot change the owner
-- (the WITH CHECK clause enforces this AFTER the update, while USING checks
-- ownership BEFORE the update).
create policy "Owners can update their reports"
  on public.pet_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Only the owner can delete their report
create policy "Owners can delete their reports"
  on public.pet_reports for delete
  using (auth.uid() = user_id);

-- ── Storage ───────────────────────────────────────────────────

-- Create the bucket (run once, or create via Dashboard → Storage)
insert into storage.buckets (id, name, public)
values ('pet-images', 'pet-images', true)
on conflict (id) do nothing;

-- Anyone can read images (public bucket)
create policy "Public read access for pet images"
  on storage.objects for select
  using (bucket_id = 'pet-images');

-- Authenticated users can upload their own images
create policy "Authenticated users can upload pet images"
  on storage.objects for insert
  with check (
    bucket_id = 'pet-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Users can delete their own images
create policy "Users can delete own pet images"
  on storage.objects for delete
  using (
    bucket_id = 'pet-images'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Avatars bucket
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Public read access for avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Authenticated users can upload avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── Messages ───────────────────────────────────────────────────
-- Direct 1-on-1 messaging schema between users regarding pet posts

create table if not exists public.messages (
  id          uuid default gen_random_uuid() primary key,
  sender_id   uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  post_id     uuid references public.pet_reports(id) on delete set null,
  content     text not null,
  created_at  timestamptz default now() not null
);

-- Ensure foreign key constraints to profiles exist for PostgREST joins:
-- sender:profiles!sender_id(full_name, avatar_url)
-- receiver:profiles!receiver_id(full_name, avatar_url)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'messages_sender_id_profiles_fkey'
  ) then
    begin
      alter table public.messages
        add constraint messages_sender_id_profiles_fkey
        foreign key (sender_id) references public.profiles(id) on delete cascade;
    exception when others then null;
    end;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'messages_receiver_id_profiles_fkey'
  ) then
    begin
      alter table public.messages
        add constraint messages_receiver_id_profiles_fkey
        foreign key (receiver_id) references public.profiles(id) on delete cascade;
    exception when others then null;
    end;
  end if;
end $$;

-- Indexes for fast conversation lookup and sorting
create index if not exists messages_sender_receiver_idx on public.messages (sender_id, receiver_id);
create index if not exists messages_receiver_sender_idx on public.messages (receiver_id, sender_id);
create index if not exists messages_post_id_idx         on public.messages (post_id);
create index if not exists messages_created_at_idx      on public.messages (created_at);

-- RLS
alter table public.messages enable row level security;

-- Users can view messages they sent or received
create policy "Users can view their own messages"
  on public.messages for select
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- Users can insert messages as sender
create policy "Users can insert messages as sender"
  on public.messages for insert
  with check (auth.uid() = sender_id);

-- Enable Supabase Realtime for messages table
alter publication supabase_realtime add table public.messages;




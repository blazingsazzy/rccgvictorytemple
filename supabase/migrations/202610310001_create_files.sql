-- Run this SQL in the Supabase SQL Editor.
create extension if not exists pgcrypto;
create table if not exists public.qr_files (
  id uuid primary key default gen_random_uuid(),
  edit_token_hash text not null,
  storage_path text not null,
  filename text not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.qr_files enable row level security;
-- No anon/authenticated policies: only the Edge Function service role can access these records.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr-files','qr-files',false,10485760,array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=false, file_size_limit=10485760, allowed_mime_types=excluded.allowed_mime_types;

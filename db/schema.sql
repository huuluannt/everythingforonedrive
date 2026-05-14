create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table if not exists app_sessions (
  id uuid primary key default gen_random_uuid(),
  session_token text not null unique,
  microsoft_account_id text not null,
  display_name text,
  email text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_sessions_account_idx
  on app_sessions (microsoft_account_id);

create table if not exists indexed_folders (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  drive_id text not null,
  folder_id text not null,
  folder_name text not null,
  folder_path text not null,
  enabled boolean not null default true,
  item_count integer not null default 0,
  last_sync_at timestamptz,
  delta_link text,
  sync_cursor text,
  sync_status text not null default 'pending'
    check (sync_status in ('pending', 'syncing', 'idle', 'paused', 'error', 'disabled')),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, drive_id, folder_id)
);

create index if not exists indexed_folders_account_enabled_idx
  on indexed_folders (account_id, enabled);

create table if not exists drive_items (
  id uuid primary key default gen_random_uuid(),
  account_id text not null,
  drive_id text not null,
  indexed_folder_id uuid not null references indexed_folders(id) on delete cascade,
  item_id text not null,
  parent_id text,
  name text not null,
  normalized_name text not null,
  item_type text not null check (item_type in ('file', 'folder')),
  extension text,
  size bigint,
  modified_date_time timestamptz,
  web_url text,
  path text not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (indexed_folder_id, item_id)
);

create index if not exists drive_items_account_deleted_idx
  on drive_items (account_id, deleted);

create index if not exists drive_items_folder_deleted_idx
  on drive_items (indexed_folder_id, deleted);

create index if not exists drive_items_extension_idx
  on drive_items (extension);

create index if not exists drive_items_item_type_idx
  on drive_items (item_type);

create index if not exists drive_items_name_trgm_idx
  on drive_items using gin (normalized_name gin_trgm_ops);

create index if not exists drive_items_path_trgm_idx
  on drive_items using gin (lower(path) gin_trgm_ops);

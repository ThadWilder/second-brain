-- 031_api_keys.sql
-- Management-system API keys for franchise operators.
--
-- External field-management software authenticates with a bearer token
-- (sk_subhub_…). Tokens are never stored in plaintext — only their SHA-256
-- hash is kept. The raw token is returned once (by the create_api_key RPC)
-- and never retrievable again. RLS limits key visibility to the owning
-- contractor.

create extension if not exists pgcrypto;

create table if not exists api_keys (
  id             uuid        primary key default gen_random_uuid(),
  contractor_id  uuid        not null references contractor_profiles(user_id) on delete cascade,
  name           text        not null,
  key_hash       text        not null,    -- sha256 hex of the plaintext token
  key_prefix     text        not null,    -- first 18 chars shown in UI (sk_subhub_XXXXXXXX)
  active         boolean     not null default true,
  last_used_at   timestamptz,
  created_at     timestamptz not null default now()
);

create unique index if not exists api_keys_hash_idx on api_keys (key_hash);
create        index if not exists api_keys_contractor_idx on api_keys (contractor_id);

alter table api_keys enable row level security;
create policy "Contractors manage own keys" on api_keys
  for all using (auth.uid() = contractor_id) with check (auth.uid() = contractor_id);

-- ── create_api_key ──
-- Generates a random token, stores its hash, returns the plaintext once.
create or replace function create_api_key(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_raw    text;
  v_hash   text;
  v_prefix text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_name is null or trim(p_name) = '' then raise exception 'Key name is required'; end if;

  -- 'sk_subhub_' + 40 hex chars (20 random bytes) = 50-char token
  v_raw    := 'sk_subhub_' || encode(gen_random_bytes(20), 'hex');
  v_hash   := encode(digest(v_raw, 'sha256'), 'hex');
  v_prefix := left(v_raw, 18); -- 'sk_subhub_' + first 8 hex chars

  insert into api_keys (contractor_id, name, key_hash, key_prefix)
  values (auth.uid(), trim(p_name), v_hash, v_prefix);

  return v_raw;
end;
$$;

-- ── revoke_api_key ──
-- Marks a key inactive. The contractor must own it.
create or replace function revoke_api_key(p_key_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update api_keys
     set active = false
   where id = p_key_id
     and contractor_id = auth.uid();
  if not found then raise exception 'Key not found or not owned by you'; end if;
end;
$$;

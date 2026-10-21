create table if not exists public.companies (
    id uuid primary key default gen_random_uuid(),
    name text not null check (length(trim(name)) between 2 and 160),
    owner_user_id text not null,
    subscription_status text not null default 'trial'
        check (subscription_status in ('trial', 'active', 'suspended', 'expired')),
    trial_started_at timestamptz not null default now(),
    trial_ends_at timestamptz not null default (now() + interval '30 days'),
    paid_until timestamptz,
    created_at timestamptz not null default now()
);

create table if not exists public.company_members (
    company_id uuid not null references public.companies (id) on delete cascade,
    user_id text not null,
    role text not null check (role in ('manager', 'collaborator')),
    created_at timestamptz not null default now(),
    primary key (company_id, user_id)
);

create unique index if not exists company_members_single_company_per_user_idx
    on public.company_members (user_id);

create table if not exists public.company_invitations (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies (id) on delete cascade,
    email text not null,
    token_hash text not null unique,
    expires_at timestamptz not null,
    accepted_at timestamptz,
    accepted_by text,
    created_at timestamptz not null default now()
);

create index if not exists company_invitations_company_email_idx
    on public.company_invitations (company_id, lower(email));

do $$
declare
    legacy_constraint_name text;
    legacy_index record;
    legacy_index_number integer := 0;
    legacy_table_oid oid;
    legacy_policy_name text;
begin
    if to_regclass('public.service_orders') is not null
        and not exists (
            select 1
            from information_schema.columns
            where table_schema = 'public'
                and table_name = 'service_orders'
                and column_name = 'company_id'
        )
    then
        if to_regclass('public.service_orders_legacy') is not null then
            raise exception 'Both old service_orders and service_orders_legacy exist; review them before migrating.';
        end if;

        alter table public.service_orders rename to service_orders_legacy;
        legacy_table_oid := 'public.service_orders_legacy'::regclass;

        for legacy_constraint_name in
            select conname from pg_constraint where conrelid = legacy_table_oid
        loop
            execute format(
                'alter table public.service_orders_legacy rename constraint %I to %I',
                legacy_constraint_name,
                legacy_constraint_name || '_legacy'
            );
        end loop;

        for legacy_index in
            select index_class.relname
            from pg_index index_data
            join pg_class index_class on index_class.oid = index_data.indexrelid
            where index_data.indrelid = legacy_table_oid
                and not exists (
                    select 1 from pg_constraint
                    where conindid = index_class.oid
                )
        loop
            legacy_index_number := legacy_index_number + 1;
            execute format(
                'alter index public.%I rename to %I',
                legacy_index.relname,
                'service_orders_legacy_idx_' || legacy_index_number
            );
        end loop;

        for legacy_policy_name in
            select polname from pg_policy where polrelid = legacy_table_oid
        loop
            execute format(
                'drop policy %I on public.service_orders_legacy',
                legacy_policy_name
            );
        end loop;

        alter table public.service_orders_legacy enable row level security;
    end if;
end;
$$;

create table if not exists public.service_orders (
    company_id uuid not null references public.companies (id) on delete cascade,
    id text not null,
    created_by text not null,
    data jsonb not null check (jsonb_typeof(data) = 'object'),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (company_id, id)
);

create index if not exists service_orders_company_updated_idx
    on public.service_orders (company_id, updated_at desc);

create index if not exists service_orders_creator_idx
    on public.service_orders (company_id, created_by, updated_at desc);

alter table public.service_orders add column if not exists os_number text
    check (os_number is null or length(os_number) between 1 and 30);

alter table public.companies add column if not exists os_next_number bigint
    check (os_next_number is null or os_next_number >= 0);

create unique index if not exists service_orders_company_os_number_idx
    on public.service_orders (company_id, os_number) where os_number is not null;

create table if not exists public.license_codes (
    id uuid primary key default gen_random_uuid(),
    code_hash text not null unique,
    days integer not null check (days between 1 and 3660),
    note text,
    created_at timestamptz not null default now(),
    redeemed_at timestamptz,
    redeemed_company_id uuid references public.companies (id) on delete set null
);

alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.license_codes enable row level security;
alter table public.company_invitations enable row level security;
alter table public.service_orders enable row level security;

-- Access is provided only through the server API, which verifies the Neon Auth
-- JWT and applies the company membership and subscription checks on every call.
-- No client-facing Data API grants or policies are created by this migration.

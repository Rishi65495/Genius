-- Lucid Complete v2 additive migration.
-- Extends the v1 schema with media files, per-item progress, milestones,
-- room sharing/knowledge, audio/voice evidence, flashcards, spaced review,
-- and room leaderboard aggregation.
-- This migration is idempotent and preserves legacy Leafline tables.

create extension if not exists pgcrypto;

alter table public.profiles add column if not exists theme text default 'system';
alter table public.profiles add column if not exists reduced_motion boolean not null default false;
alter table public.profiles add column if not exists notification_settings jsonb not null default '{"resume":true,"review":true,"room":true,"milestone":true,"improvement":true,"recovery":true}'::jsonb;
alter table public.profiles add column if not exists availability jsonb not null default '{}'::jsonb;
alter table public.profiles add column if not exists energy_default text default 'medium';

create table if not exists public.resource_files (
 id uuid primary key default gen_random_uuid(),
 resource_id uuid not null references public.lucid_resources(id) on delete cascade,
 storage_bucket text not null default 'learning-assets',
 storage_path text not null,
 byte_size bigint,
 original_name text,
 mime_type text,
 checksum text,
 created_at timestamptz not null default now(),
 unique(resource_id)
);

create table if not exists public.resource_item_progress (
 id uuid primary key default gen_random_uuid(),
 resource_id uuid not null references public.lucid_resources(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 item_key text not null,
 position numeric not null default 0,
 speed numeric not null default 1,
 completed boolean not null default false,
 last_activity_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb,
 unique(resource_id,user_id,item_key)
);

create table if not exists public.catalogue_milestones (
 id uuid primary key default gen_random_uuid(),
 catalogue_id uuid not null references public.catalogues(id) on delete cascade,
 title text not null,
 description text,
 target numeric not null default 100,
 completion numeric not null default 0 check(completion between 0 and 100),
 order_index integer not null default 0,
 due_at timestamptz,
 created_at timestamptz not null default now(),
 completed_at timestamptz
);

create table if not exists public.room_shared_resources (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 resource_id uuid not null references public.lucid_resources(id) on delete cascade,
 added_by uuid not null references auth.users(id) on delete cascade,
 order_index integer not null default 0,
 created_at timestamptz not null default now(),
 unique(room_id,resource_id)
);

create table if not exists public.room_knowledge (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.rooms(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete cascade,
 source_type text not null default 'manual',
 title text,
 body text not null,
 concept_key text,
 attribution jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);

create table if not exists public.audio_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 resource_id uuid references public.lucid_resources(id) on delete set null,
 catalogue_id uuid references public.catalogues(id) on delete set null,
 mode text not null,
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 active_seconds integer not null default 0,
 completed boolean not null default false,
 result jsonb not null default '{}'::jsonb
);

create table if not exists public.voice_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 resource_id uuid references public.lucid_resources(id) on delete set null,
 question_id uuid references public.questions(id) on delete set null,
 transcript text not null,
 score numeric,
 coverage numeric,
 accuracy numeric,
 clarity numeric,
 missing jsonb not null default '[]'::jsonb,
 feedback text,
 created_at timestamptz not null default now()
);

create table if not exists public.practice_cards (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 resource_id uuid references public.lucid_resources(id) on delete cascade,
 catalogue_id uuid references public.catalogues(id) on delete cascade,
 front text not null,
 back text not null,
 concept_key text,
 due_at timestamptz not null default now(),
 repetitions integer not null default 0,
 stability numeric not null default 1,
 created_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb
);

create or replace function public.set_next_review(p_journey_id uuid,p_score numeric)
returns public.learning_journeys
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare uid uuid:=auth.uid();days integer;r public.learning_journeys;
begin
 if uid is null then raise exception 'not authenticated'; end if;
 if p_score>=90 then days:=14; elsif p_score>=80 then days:=7; elsif p_score>=60 then days:=3; else days:=1; end if;
 update public.learning_journeys
 set next_review_at=now()+(days||' days')::interval,last_activity_at=now(),updated_at=now()
 where id=p_journey_id and owner_id=uid
 returning * into r;
 if r.id is null then raise exception 'journey not found or not owned'; end if;
 return r;
end $$;

create or replace function public.get_room_leaderboard(p_room_id uuid)
returns table(display_name text,xp bigint,focus_minutes numeric,avg_test_score numeric,improvement numeric,contribution_count bigint)
language sql
security definer
set search_path=public,pg_temp
as $$
with members as (
 select user_id from public.room_members where room_id=p_room_id and status='active'
),
focus as (
 select user_id,sum(coalesce(active_seconds,0))/60.0 mins
 from public.reading_sessions where user_id in(select user_id from members) group by user_id
),
scores as (
 select a.user_id,avg(coalesce(a.score,0)) avg_score,avg(coalesce(a.improvement,0)) avg_improvement
 from public.room_test_attempts a join public.room_tests t on t.id=a.room_test_id
 where t.room_id=p_room_id group by a.user_id
),
contrib as (
 select user_id,count(*) c from public.room_events where room_id=p_room_id group by user_id
)
select coalesce(p.display_name,'Learner'),coalesce(x.xp,0),coalesce(f.mins,0),coalesce(s.avg_score,0),coalesce(s.avg_improvement,0),coalesce(c.c,0)
from members m
left join public.profiles p on p.id=m.user_id
left join public.user_xp x on x.user_id=m.user_id
left join focus f on f.user_id=m.user_id
left join scores s on s.user_id=m.user_id
left join contrib c on c.user_id=m.user_id
order by coalesce(x.xp,0) desc,coalesce(s.avg_improvement,0) desc,coalesce(f.mins,0) desc
$$;

alter table public.resource_files enable row level security;
alter table public.resource_item_progress enable row level security;
alter table public.catalogue_milestones enable row level security;
alter table public.room_shared_resources enable row level security;
alter table public.room_knowledge enable row level security;
alter table public.audio_sessions enable row level security;
alter table public.voice_attempts enable row level security;
alter table public.practice_cards enable row level security;

drop policy if exists "lucid resource files own" on public.resource_files;
create policy "lucid resource files own" on public.resource_files to authenticated using(exists(select 1 from public.lucid_resources r where r.id=resource_id and r.owner_id=(select auth.uid()))) with check(exists(select 1 from public.lucid_resources r where r.id=resource_id and r.owner_id=(select auth.uid())));

drop policy if exists "lucid item progress own" on public.resource_item_progress;
create policy "lucid item progress own" on public.resource_item_progress to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

drop policy if exists "lucid milestones own" on public.catalogue_milestones;
create policy "lucid milestones own" on public.catalogue_milestones to authenticated using(exists(select 1 from public.catalogues c where c.id=catalogue_id and c.owner_id=(select auth.uid()))) with check(exists(select 1 from public.catalogues c where c.id=catalogue_id and c.owner_id=(select auth.uid())));

drop policy if exists "lucid room shared resources member" on public.room_shared_resources;
create policy "lucid room shared resources member" on public.room_shared_resources to authenticated using(exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=(select auth.uid()) and rm.status='active')) with check(exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=(select auth.uid()) and rm.status='active'));

drop policy if exists "lucid room knowledge member" on public.room_knowledge;
create policy "lucid room knowledge member" on public.room_knowledge to authenticated using(exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=(select auth.uid()) and rm.status='active')) with check((select auth.uid())=created_by and exists(select 1 from public.room_members rm where rm.room_id=room_id and rm.user_id=(select auth.uid()) and rm.status='active'));

drop policy if exists "lucid audio sessions own" on public.audio_sessions;
create policy "lucid audio sessions own" on public.audio_sessions to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

drop policy if exists "lucid voice attempts own" on public.voice_attempts;
create policy "lucid voice attempts own" on public.voice_attempts to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

drop policy if exists "lucid practice cards own" on public.practice_cards;
create policy "lucid practice cards own" on public.practice_cards to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);

create index if not exists idx_lucid_resource_files_resource on public.resource_files(resource_id);
create index if not exists idx_lucid_item_progress_user on public.resource_item_progress(user_id,resource_id,item_key);
create index if not exists idx_lucid_milestones_catalogue on public.catalogue_milestones(catalogue_id,order_index);
create index if not exists idx_lucid_shared_resources_room on public.room_shared_resources(room_id,order_index);
create index if not exists idx_lucid_knowledge_room on public.room_knowledge(room_id,created_at desc);
create index if not exists idx_lucid_audio_user on public.audio_sessions(user_id,started_at desc);
create index if not exists idx_lucid_voice_user on public.voice_attempts(user_id,created_at desc);
create index if not exists idx_lucid_cards_due on public.practice_cards(user_id,due_at);

grant execute on function public.set_next_review(uuid,numeric) to authenticated;
grant execute on function public.get_room_leaderboard(uuid) to authenticated;

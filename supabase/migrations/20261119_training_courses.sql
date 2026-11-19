-- Galini Training Portal: course catalog and assignments
-- Run this once in the existing Galini Supabase SQL Editor before enabling Training.
create extension if not exists pgcrypto;

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  category text not null default 'General',
  level text not null default 'All levels',
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  content_url text,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_enrollments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid,
  assigned_by uuid references auth.users(id) on delete set null,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed')),
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(course_id,user_id)
);

create index if not exists training_enrollments_user_idx on public.training_enrollments(user_id);
create index if not exists training_enrollments_agency_idx on public.training_enrollments(agency_id);
create index if not exists training_enrollments_course_idx on public.training_enrollments(course_id);

alter table public.training_courses enable row level security;
alter table public.training_enrollments enable row level security;

-- The application accesses these tables through server-side routes after checking
-- the user's role. Do not grant anon/authenticated direct table access here.
revoke all on public.training_courses from anon, authenticated;
revoke all on public.training_enrollments from anon, authenticated;

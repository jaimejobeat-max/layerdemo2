-- Layer Studios — reservation request queue
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Access is server-side only (Vercel functions with the service_role key);
-- RLS is enabled with no policies, so the anon key cannot read or write.

create table if not exists public.reservation_requests (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),

  -- what the customer asked for
  studio        text not null,                 -- 'layer-41', 'layer-20', …
  part          text not null default '-',     -- 'A', 'A+B', '1F', '-'
  date          date not null,                 -- calendar day (KST)
  start_at      time not null,                 -- 09:00, 13:30 …
  end_at        time not null,
  purpose       text,                          -- 사진 / 영상 / 행사
  people        text,
  vehicles      text,
  note          text,

  -- who
  company       text not null,
  contact       text not null,
  phone         text not null,
  email         text,
  lang          text not null default 'ko' check (lang in ('ko', 'en')),

  -- CS decision: pending → approved (++ on the board) → confirmed (confirmed label) → cancelled (label '-'); or hold / rejected
  status        text not null default 'pending' check (status in ('pending', 'hold', 'approved', 'confirmed', 'rejected', 'cancelled')),
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,

  -- what was written to the schedule board on approval
  board_id      text,
  board_label   text,                          -- '++(W1)' or a confirmed label
  board_post_no text,
  board_error   text,

  constraint reservation_requests_time_order check (end_at > start_at)
);

create index if not exists reservation_requests_status_idx
  on public.reservation_requests (status, created_at desc);
create index if not exists reservation_requests_studio_date_idx
  on public.reservation_requests (studio, date);

-- every change, for the "처리 기록" panel
create table if not exists public.reservation_events (
  id          bigint generated always as identity primary key,
  request_id  bigint not null references public.reservation_requests (id) on delete cascade,
  created_at  timestamptz not null default now(),
  actor       text not null default 'system',   -- 'homepage', staff name, 'system'
  action      text not null,                    -- 'submitted', 'approved', 'hold', 'rejected', 'board_written', 'board_failed', 'note'
  detail      text
);

create index if not exists reservation_events_request_idx
  on public.reservation_events (request_id, created_at);

alter table public.reservation_requests enable row level security;
alter table public.reservation_events   enable row level security;

-- small helper view for the queue counts
create or replace view public.reservation_status_counts as
  select status, count(*)::int as count
  from public.reservation_requests
  group by status;

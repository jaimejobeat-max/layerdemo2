-- Adds the 확정 (confirmed) and 취소 (cancelled) statuses.
-- Run once in Supabase → SQL Editor (projects created before 2026-09-29 only; schema.sql already has the new list).
alter table public.reservation_requests drop constraint if exists reservation_requests_status_check;
alter table public.reservation_requests
  add constraint reservation_requests_status_check
  check (status in ('pending', 'hold', 'approved', 'confirmed', 'rejected', 'cancelled'));

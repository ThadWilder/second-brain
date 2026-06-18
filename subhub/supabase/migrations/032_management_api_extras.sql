-- 032_management_api_extras.sql
-- Two small schema additions needed by the management-system API (migration 031):
--
--  1. job_status gets a 'cancelled' value so the cancel_job action can
--     update status without a raw-text fallback.
--  2. jobs.external_ref — an optional opaque ID from the contractor's own
--     field-management software (e.g. ServiceTitan work-order number).
--     Stored for correlation; never displayed to subs.

alter type job_status add value if not exists 'cancelled';

alter table jobs
  add column if not exists external_ref text;

comment on column jobs.external_ref is
  'Opaque ID from the contractor''s field-management system (e.g. ServiceTitan WO#). Populated via management API; never shown to subs.';

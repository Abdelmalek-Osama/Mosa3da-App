-- =============================================================================
-- Migration 0010: Optional English name for visitors (P1-07)
--
-- full_name stays the mandatory Arabic name (validated in the app as a triple
-- name). full_name_en is optional and feeds the bilingual lobby layout.
-- =============================================================================

begin;

alter table public.patients
  add column if not exists full_name_en text
  check (full_name_en is null or char_length(full_name_en) <= 120);

commit;

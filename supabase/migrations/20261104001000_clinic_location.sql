-- =============================================================================
-- Migration 0011: Clinic address and map link (P1-12)
--
-- Optional fields the doctor sets in Clinic settings. They are included in the
-- one-tap WhatsApp booking confirmation sent by reception.
-- =============================================================================

begin;

alter table public.doctor_settings
  add column if not exists clinic_address text
    check (clinic_address is null or char_length(clinic_address) <= 300),
  add column if not exists clinic_map_url text
    check (clinic_map_url is null or (char_length(clinic_map_url) <= 500 and clinic_map_url ~ '^https://'));

commit;

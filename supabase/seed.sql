-- =============================================================================
-- Mosa3da — Demo seed (non-auth data only)
-- Doctor / secretary / patient auth accounts are created by the TypeScript seed
-- script through the Supabase Admin API (scripts/seed-demo.ts, Thread 2), which
-- then links patients.auth_user_id. This file is safe to re-run.
-- =============================================================================

begin;

update public.doctor_settings
set clinic_name                  = 'Mosa3da Women''s Clinic',
    clinic_name_ar               = 'عيادة مساعدة لأمراض النساء والتوليد',
    doctor_display_name          = 'Dr. Nadia El-Sayed',
    timezone                     = 'Africa/Cairo',
    default_consultation_minutes = 20,
    whatsapp_threshold_minutes   = 30,
    late_policy_consultations    = 2,
    booking_horizon_days         = 30,
    cancellation_cutoff_minutes  = 120,
    slot_interval_minutes        = 20
where id = 1;

-- Working periods: Sun–Thu 14:30–18:30, Saturday split shift. Friday off.
delete from public.clinic_working_days;
insert into public.clinic_working_days (weekday, start_time, end_time) values
  (0, '14:30', '18:30'),
  (1, '14:30', '18:30'),
  (2, '14:30', '18:30'),
  (3, '14:30', '18:30'),
  (4, '14:30', '18:30'),
  (6, '10:00', '13:00'),
  (6, '17:00', '20:00');

-- Demo patients (walk-in style, no auth accounts yet).
insert into public.patients (full_name, normalized_phone, email, date_of_birth, phone_verified_at) values
  ('Mariam Ahmed Hassan',     '01001234561', 'mariam.hassan@example.com', '1994-03-12', now()),
  ('Salma Mahmoud Ibrahim',   '01001234562', null,                        '1991-07-02', now()),
  ('Nour Khaled Mostafa',     '01101234563', 'nour.k@example.com',        '1997-11-23', now()),
  ('Yasmin Adel Fathy',       '01201234564', null,                        '1989-01-30', now()),
  ('Hana Tarek Soliman',      '01501234565', 'hana.soliman@example.com',  '1995-05-17', now()),
  ('Farida Omar Abdelrahman', '01001234566', null,                        '1993-09-08', now()),
  ('Laila Samir Youssef',     '01101234567', null,                        '1990-12-14', now()),
  ('Reem Hossam Nabil',       '01201234568', 'reem.nabil@example.com',    '1998-02-27', now()),
  ('Dina Sherif Kamal',       '01501234569', null,                        '1987-06-05', now()),
  ('Aya Mohamed Lotfy',       '01001234570', null,                        '1999-08-19', now())
on conflict (normalized_phone) do nothing;

commit;

\# Mosa3da (مساعدة) — Full-Stack POC Master Implementation Prompt



\*\*Project type:\*\* Full-Stack Healthcare Clinic Management \*\*POC\*\* \*\*Deadline:\*\* Client demonstration tomorrow \*\*Deployment target:\*\* Vercel + Supabase \*\*Architecture:\*\* Next.js Full-Stack Application \*\*Priority:\*\* Functional business logic, premium UX, mobile responsiveness, reliability, and maintainable code.



\---



\# 1. Your Role



Act like a Principal Full-Stack Engineer, Senior Next.js Architect, Supabase Database Architect, Healthcare Product Designer, and experienced Software Engineering Mentor.



Your mission is to build a complete, functional, responsive web application called \*\*Mosa3da (مساعدة)\*\* for an individual Obstetrician and Gynecologist's private clinic.



You are operating as an autonomous coding agent using Claude Code.



You must inspect, plan, implement, run, test, debug, and verify the actual application.



Do not just generate code snippets, architectural documents, or prototypes with nonfunctional buttons.



Build the working solution.



The application must be ready for a real client demonstration tomorrow.



\# 2. Product Scope



Mosa3da is a clinic management system that simplifies:



\## Patient registration.



\## Appointment booking. ## Doctor availability management. ## Walk-in patient registration. ## Daily patient queue management. ## Dynamic consultation-time calculations. ## Patient appointment tracking. ## Waiting-room queue displays. ## WhatsApp notification simulation. ## Doctor and secretary administration.



This is a single-clinic implementation.



\*\*IMPORTANT\*\*: Do not implement the SaaS subscription business yet.



Do not implement:



\- Subscription plans.

\- Payment gateways.

\- Billing.

\- Multi-tenant infrastructure.

\- Multiple clinic onboarding.

\- SaaS super-admin dashboard.

\- Subscription management.



However, design the domain and configuration so that clinic identity, doctor information, and branding can be generalized when the product becomes SaaS later.



The working product name is Mosa3da. Keep it configurable.



\# 3. Technology Stack



Use the following stack:



\## Full-Stack Framework



\- Next.js using the App Router.

\- TypeScript with strict mode.

\- React Server Components where appropriate.

\- Server Actions for application mutations.

\- Route Handlers for \*\*HTTP\*\* endpoints, integrations, webhooks, and scheduled jobs.



Use the latest stable Next.js version compatible with the installed ecosystem.



\## Frontend



\- Tailwind \*\*CSS\*\*.

\- shadcn/ui.

\- Lucide React.

\- React Hook Form.

\- Zod.

\- TanStack Query where client-side server-state management is useful.



\## Backend



The backend must live inside the Next.js application.



Use:

\- Server Actions.

\- Route Handlers.

\- Server-only application services.

\- Repository abstractions.

\- Zod validation.

\- Centralized error handling.



Do not put business logic directly inside React components or large Server Actions.



\## Database and Authentication



\- Supabase PostgreSQL.

\- Supabase Auth.

\- Supabase Realtime.

\- Supabase Row Level Security.

\- Official Supabase JavaScript client.

\- @supabase/ssr for secure Next.js authentication integration.



Use \*\*SQL\*\* migrations as the source of truth for database schema and \*\*RLS\*\* policies.



Do not introduce Prisma and Supabase migrations simultaneously as competing schema-management systems. Prefer the Supabase \*\*CLI\*\* migration workflow for this \*\*POC\*\*.



\## Deployment



\- Vercel: Full-stack Next.js application.

\- Supabase: PostgreSQL and authentication.



The target is to use available free tiers.



Verify current hosting limitations before promising free deployment. Do not assume free-tier limits are permanent.



\# 4. Application Architecture



Create a maintainable, feature-oriented architecture.



Suggested structure:



```text src/ ├── app/ │   ├── (auth)/ │   ├── admin/ │   ├── patient/ │   ├── display/ │   ├── api/ │   └── layout.tsx │ ├── components/ │   ├── ui/ │   ├── layout/ │   └── shared/ │ ├── features/ │   ├── authentication/ │   ├── patients/ │   ├── appointments/ │   ├── scheduling/ │   ├── queue/ │   ├── secretaries/ │   ├── notifications/ │   └── dashboard/ │ ├── server/ │   ├── application/ │   ├── domain/ │   ├── repositories/ │   ├── services/ │   ├── authorization/ │   └── integrations/ │ ├── lib/ │   ├── supabase/ │   ├── validation/ │   ├── errors/ │   └── utils/ │ ├── hooks/ ├── types/ ├── constants/ └── styles/ ```



Adapt the structure when necessary.



Maintain clear separation between:



\- Presentation.

\- Application orchestration.

\- Business rules.

\- Database access.

\- External integrations.



Use server-only modules for privileged operations.



Avoid unnecessary abstractions and excessive design patterns.



The goal is clean, understandable, maintainable, educational code.



\# 5. Application Roles and Authorization



Implement three roles.



\## Doctor — Super Administrator



The doctor has the highest privileges.



Can:



\- View all clinic information.

\- Register and manage patients.

\- Add walk-in patients.

\- Manage appointments.

\- Manage the daily queue.

\- Change queue statuses.

\- Complete consultations.

\- Configure working days and hours.

\- Configure default consultation duration.

\- Configure WhatsApp notification thresholds.

\- Create secretary accounts.

\- Activate/deactivate secretaries.



\## Secretary — Administrator



Can:



\- View the operational dashboard.

\- Register patients.

\- Search patients.

\- Add walk-in patients.

\- Book appointments.

\- Manage appointments.

\- Manage the queue.

\- Update patient statuses.

\- Complete consultations.



Cannot:



\- Create or manage secretary accounts.

\- Modify doctor-only settings.

\- Change doctor account credentials.



\## Patient — Viewer



Can:



\- Register.

\- Log in.

\- View and update permitted profile information.

\- Book appointments.

\- View personal appointments.

\- View personal queue status.

\- View estimated consultation time.

\- Cancel eligible appointments.



Patients must \*\*NEVER\*\* access other patients' records.



Implement authorization on the server for every protected operation.



Frontend route protection is supplementary, not the security boundary.



\# 6. Authentication



Use Supabase Auth.



\## Doctor



Create an initial doctor account through a secure seed/setup process.



Credentials must be supplied through environment variables or a secure administrative setup process.



Never hardcode production credentials.



\## Secretary



The doctor can create secretaries.



Required information:



\- Full name.

\- Email or username.

\- Password.

\- Active/inactive status.



Use Supabase Admin Auth APIs exclusively from trusted server-side code for account provisioning.



The secretary must be prevented from logging in when their account is inactive.



Implement role records in a dedicated database table linked to the Supabase Auth user \*\*UUID\*\*.



Never allow users to assign themselves privileged roles through public registration.



\## Patient



Registration requires:



\- Full name.

\- Phone number.

\- Password.

\- Optional email.



Phone number must be unique and normalized.



Patients log in using phone number and password.



\### WhatsApp OTP Verification



For the \*\*POC\*\*, implement a simulated six-digit \*\*OTP\*\*.



Flow:



\## Patient enters registration details.



\## Generate a secure random OTP. ## Store only a hashed OTP with an expiration time. ## Display the OTP through a clearly marked development-only demo interface. ## Patient enters the OTP. ## Verify OTP and expiration. ## Activate the patient account.



Create an abstraction for a future real WhatsApp \*\*OTP\*\* provider.



Do not claim that the mock \*\*OTP\*\* was delivered through WhatsApp.



\# 7. Application Routes



Implement the following routes:



```text /login



/admin/dashboard /admin/queue /admin/patients /admin/appointments /admin/settings /admin/secretaries



/patient/register /patient/login /patient/dashboard /patient/book-appointment /patient/my-appointments



/display ```



The admin workspace is shared between doctor and secretary.



Display role-specific actions and permissions.



The waiting-room display is public, read-only, and must not require authentication.



\# 8. Doctor Dashboard



Create a premium operational dashboard.



Display:



\- Clinic and doctor identity.

\- Current date.

\- Today's appointments.

\- Total registered patients.

\- Currently consulting.

\- Total waiting.

\- Ready patient.

\- Late patients.

\- Completed consultations.



Provide quick actions:



\- Add walk-in.

\- Register patient.

\- Book appointment.

\- Open queue.

\- Manage patients.



The dashboard must be useful immediately when opened.



Include realistic demonstration data.



\# 9. Doctor Availability Management



The doctor configures:



\- Available weekdays.

\- Opening time.

\- Closing time.

\- Default consultation duration.

\- WhatsApp alert threshold.

\- Clinic timezone.



Example:



```text Sunday: 14:30 - 18:30 Monday: 14:30 - 18:30



Default consultation: 20 minutes WhatsApp threshold: 30 minutes ```



Support multiple working periods per day if practical.



Patients must only be able to select dates and times that comply with doctor availability.



Prevent bookings outside working hours.



Prevent conflicting or duplicate appointments.



All date and time calculations must use the clinic's configured timezone. Store timestamps consistently in \*\*UTC\*\* and convert them for display.



\# 10. Patient Registration and Management



Patient entity:



\- Id.

\- AuthUserId.

\- FullName.

\- NormalizedPhoneNumber.

\- Email.

\- CreatedAt.

\- IsActive.



Phone number must have a unique database constraint.



Use UUIDs as primary keys rather than phone numbers.



Admin features:



\- Register a patient.

\- Search patients.

\- View patient profile.

\- Edit permitted patient information.

\- Select existing patients during booking.



Avoid duplicate patient records.



\# 11. Appointment Management



Separate appointments from queue entries.



An appointment represents a booking.



A queue entry represents a patient's participation in a particular clinic-day queue.



This distinction is important: a patient with an appointment next week must not appear in today's waiting queue.



Appointment information:



\- PatientId.

\- AppointmentDate.

\- RequestedTime or assigned slot.

\- VisitReason.

\- ConsultationNotes.

\- Status.

\- CreatedAt.



Initial visit reasons:



\- Pregnancy confirmation.

\- Routine antenatal consultation.

\- Pregnancy follow-up.

\- Ultrasound.

\- 4D ultrasound.

\- Postpartum consultation.

\- Gynecology consultation.

\- Other.



Patient booking flow:



\## Select date.



\## View available times. ## Select visit reason. ## Add optional notes. ## Confirm booking. ## View booking confirmation.



Initial appointment status: Scheduled.



Support cancellation according to eligibility rules.



\# 12. Walk-In Registration



This is one of the most important clinic workflows.



Create a quick registration form for the secretary.



Fields:



\- Patient full name.

\- Existing/new patient selection.

\- Phone number.

\- Visit reason / diagnostic.

\- Estimated consultation duration.

\- Optional notes.



Default duration: 20 minutes.



After submission:



\## Create the patient if necessary.



\## Create the appointment/visit record. ## Create a queue entry. ## Assign the next queue number. ## Set status to Arrived. ## Calculate expected consultation times. ## Refresh all relevant views.



Avoid requiring unnecessary navigation or multiple screens.



\# 13. Queue Management Engine



Implement all queue business logic on the server.



Do not calculate authoritative queue positions in React components.



\## Queue statuses



```text Scheduled Arrived Ready Current Late Finished Cancelled ```



Definitions:



\- Scheduled: Patient has booked but has not checked in.

\- Arrived: Patient has physically arrived.

\- Ready: Next eligible patient.

\- Current: Patient currently consulting with the doctor.

\- Late: Patient missed their turn and was moved to the end.

\- Finished: Consultation completed.

\- Cancelled: Appointment cancelled.



Default walk-in status: Arrived.



Only one patient can have the Current status within a clinic session.



Only one eligible patient should occupy the Ready position.



\## Queue Ordering



Every queue entry must contain:



\- QueueEntryId.

\- ClinicDate.

\- PatientId.

\- AppointmentId, when applicable.

\- QueueNumber.

\- Position.

\- VisitReason.

\- EstimatedDurationMinutes.

\- ExpectedStartTime.

\- Status.

\- CreatedAt.

\- UpdatedAt.



Maintain deterministic ordering.



Use registration/arrival order and a stable secondary identifier.



Do not allow Scheduled patients to consume active walk-in queue positions before they check in.



\## Expected Consultation Time Calculation



Formula:



```text ExpectedStart(1) = ClinicOpeningTime



ExpectedStart(N) = ExpectedStart(N-1) + Duration(N-1) ```



Example:



```text Clinic starts: 14:30



Patient 1: 15 minutes Patient 2: 20 minutes Patient 3: 20 minutes



Patient 1: 14:30 Patient 2: 14:45 Patient 3: 15:05 ```



Recalculate after:



\- Patient arrival.

\- Patient addition.

\- Patient cancellation.

\- Consultation completion.

\- Late patient transition.

\- Queue reordering.

\- Consultation duration changes.



Exclude Finished and Cancelled patients from the active waiting-time calculation.



Use the configured clinic opening time as the initial reference where appropriate.



Document how already-running consultations affect the projection.



\## Queue Transitions



When a patient is added:



\## Assign a position.



\## Calculate the estimated time. ## Promote the first eligible patient to Ready if no patient is Current. ## Update queue projections.



When a consultation finishes:



\## Mark Current patient Finished.



\## Identify the next eligible Ready patient. ## Require explicit staff confirmation before starting their consultation. ## Promote the following eligible patient to Ready. ## Recalculate expected times.



Use database transactions or PostgreSQL \*\*RPC\*\* functions for critical queue mutations.



Protect against concurrent staff actions.



Never allow two Current patients.



Do not rely on frontend-only locking.



\# 14. Late Patient Policy



Implement this exact business rule.



When a patient is Ready but absent:



\## Staff marks the patient as absent.



\## Record the missed-turn event. ## Begin tracking subsequent completed consultations. ## Allow two subsequent consultations to finish. ## If the patient remains absent after those two consultations, automatically transition them to Late. ## Move the patient to the end of the eligible queue. ## Recalculate expected consultation times.



Example:



```text Patient A = Current Patient B = Ready but absent



Patient A finishes. Patient B misses their turn.



Two subsequent consultations finish.



Patient B is still absent.



Patient B becomes Late. Patient B moves to the end of the queue. ```



Track this with explicit database fields or a dedicated queue event record.



Do not use arbitrary timers.



Do not count the consultation that caused the initial missed turn as one of the two subsequent consultations.



If the patient arrives before the policy is completed, cancel the late transition and allow the staff to manage their status.



Record all transitions in queue history.



\# 15. Admin Queue Interface



Create three major panels.



\## Currently Consulting



Display:



\- Patient name.

\- Queue number.

\- Visit reason.

\- Duration.

\- Consultation start time.

\- Elapsed time.

\- Finish consultation button.



\## Next Patient



Display:



\- Patient name.

\- Queue number.

\- Expected time.

\- Status.

\- Start consultation action.



\## Waiting Queue



Display:



\- Queue number.

\- Patient name.

\- Phone number.

\- Visit reason.

\- Estimated duration.

\- Expected start time.

\- Status.

\- Actions.



Actions:



\- Mark arrived.

\- Mark ready.

\- Mark absent.

\- Start consultation.

\- Finish consultation.

\- Mark late.

\- Cancel.



Provide confirmation dialogs for important state transitions.



On mobile, replace large tables with readable responsive cards.



\# 16. Patient Portal



The patient dashboard must display:



\- Welcome message.

\- Upcoming appointment.

\- Appointment date.

\- Expected consultation time.

\- Personal queue status.

\- Number of patients ahead.

\- Estimated waiting time.

\- Booking history.

\- Book appointment action.



Patients can only see their own information.



Never expose the complete clinic queue through patient endpoints.



Use clear language rather than technical queue terminology.



Make this experience especially good on mobile.



\# 17. Waiting Room Display



Route:



```text /display ```



Create a dedicated public waiting-room display.



Show:



\- Clinic branding.

\- Current consultation.

\- Next patient.

\- Queue number.

\- Expected consultation time.

\- Waiting queue.

\- Current time.



Use large, highly legible typography suitable for TVs.



Privacy requirements:



Never display:



\- Phone numbers.

\- Emails.

\- Medical notes.

\- Diagnoses.

\- Full patient profiles.



Use anonymized names or queue tokens.



The endpoint serving this page must return only explicitly approved public display fields.



Do not expose internal database records.



Update the display automatically using Supabase Realtime or reliable polling.



\# 18. WhatsApp Notification Simulation



Real WhatsApp Business integration is not required for the \*\*POC\*\*.



Implement a replaceable notification architecture.



The doctor configures a threshold.



Example:



```text Threshold = 30 minutes ```



When the expected consultation time is within the threshold, generate:



"Hello {PatientName}, your consultation is approaching. Your expected consultation time is {Time}. Please proceed to the clinic."



Implement:



\- Notification eligibility calculation.

\- Notification logs.

\- Pending/sent/failed states.

\- Duplicate prevention.

\- Notification history.

\- Development notification simulator.



Use a Vercel Cron-compatible Route Handler for periodic processing if scheduling is needed.



Protect the cron endpoint using a secret.



Use database-backed idempotency so repeated executions cannot send duplicate notifications.



For demo purposes, simulated messages should be visible in the admin dashboard.



Never claim that real WhatsApp messages were sent.



\# 19. Database Schema



Use Supabase PostgreSQL.



Create \*\*SQL\*\* migrations for:



```text profiles patients doctor\_settings clinic\_working\_days clinic\_sessions appointments queue\_entries queue\_status\_history otp\_verifications notification\_logs ```



You may introduce additional tables when justified.



Requirements:



\- \*\*UUID\*\* primary keys.

\- Foreign keys.

\- Unique normalized phone numbers.

\- Appropriate indexes.

\- Check constraints.

\- \*\*UTC\*\* timestamps.

\- Explicit clinic timezone.

\- Transaction-safe queue mutations.

\- Referential integrity.



Link profiles to Supabase Auth users.



Use database constraints to enforce important invariants wherever possible.



Do not store plaintext passwords or plaintext \*\*OTP\*\* values.



\# 20. Supabase Security



Security is mandatory even for the \*\*POC\*\*.



Implement:



\- Supabase Auth.

\- @supabase/ssr.

\- Secure cookie-based sessions.

\- Server-side authentication verification.

\- Role-based authorization.

\- Row Level Security policies.

\- Protected database access.

\- Environment variable validation.



Create separate Supabase clients for:



\## Browser access.



\## Authenticated server-side access. ## Privileged administrative operations.



Never expose:



```text SUPABASE\_SERVICE\_ROLE\_KEY DATABASE\_PASSWORD JWT\_SECRET ```



to the browser.



Never place service-role credentials in NEXT\_PUBLIC variables.



Do not assume middleware alone provides authorization.



Verify user identity and permissions inside every sensitive Server Action and Route Handler.



If privileged server-side database access bypasses \*\*RLS\*\*, implement explicit authorization checks and document the security boundary.



\# 21. Backend Application Architecture



Keep backend logic separated from Next.js presentation.



Use:



```text server/ ├── domain/ │   ├── entities/ │   ├── enums/ │   ├── rules/ │   └── errors/ │ ├── application/ │   ├── patients/ │   ├── appointments/ │   ├── queue/ │   ├── scheduling/ │   └── notifications/ │ ├── repositories/ ├── services/ ├── authorization/ └── integrations/ ```



Implement:



\- Domain entities and invariants.

\- Application use cases.

\- Repository abstractions where valuable.

\- DTOs.

\- Zod validation.

\- Centralized exception handling.

\- Structured logging.

\- Typed responses.

\- Consistent error handling.



Use Server Actions for authenticated UI mutations.



Use Route Handlers for:



\- Realtime-safe public data endpoints.

\- Cron processing.

\- Health checks.

\- External integrations.



Do not place large amounts of business logic directly in Server Actions.



\# 22. Frontend Design and UX



Build a premium medical software experience.



Brand:



Mosa3da — مساعدة.



Visual direction:



\- Medical navy.

\- Teal accents.

\- White surfaces.

\- Soft neutral backgrounds.

\- Professional typography.

\- Clear status colors.

\- Subtle borders.

\- Consistent spacing.

\- Restrained shadows.

\- Professional icons.



Avoid generic admin-template appearance.



\## Desktop UX



\- Persistent sidebar.

\- Clear page hierarchy.

\- Operational dashboard.

\- Efficient patient tables.

\- Organized forms.

\- Clear appointment calendar.

\- Queue overview.



\## Mobile UX



Mobile responsiveness is mandatory.



Test at approximately 390px width.



Provide:



\- Collapsible navigation.

\- Mobile-friendly header.

\- Touch-friendly buttons.

\- Stacked cards.

\- Responsive forms.

\- Compact queue cards.

\- Readable appointment calendar.

\- Appropriate modals and drawers.

\- No horizontal overflow.



The patient portal should be mobile-first.



The admin portal should remain practical on both desktop and mobile.



The waiting-room display should adapt to large screens and tablets.



\# 23. Real-Time Updates



Keep these views synchronized:



\- Admin dashboard.

\- Admin queue.

\- Patient dashboard.

\- Waiting-room display.



Use Supabase Realtime with secure subscriptions where appropriate.



Subscribe only to data the current user is authorized to receive.



Use TanStack Query invalidation or controlled cache updates.



Provide polling fallback when realtime is disconnected.



Never let stale frontend data overwrite newer server state.



\# 24. Testing



Use:



\- Vitest.

\- React Testing Library.

\- Playwright.

\- Appropriate PostgreSQL integration tests.



Prioritize:



\### Authentication



\- Doctor login.

\- Secretary login.

\- Patient registration.

\- \*\*OTP\*\* verification.

\- Inactive secretary rejection.

\- Role authorization.



\### Queue



\- Queue ordering.

\- Expected-time calculations.

\- Status transitions.

\- Single Current invariant.

\- Ready patient selection.

\- Late patient policy.

\- Cancellation.

\- Concurrent queue mutations.



\### Appointments



\- Availability.

\- Booking conflicts.

\- Cancellation.

\- Patient ownership.



\### Notifications



\- Threshold calculation.

\- Duplicate prevention.

\- Notification history.



\### Frontend



\- Protected routes.

\- Registration.

\- Booking.

\- Queue actions.

\- Mobile navigation.

\- Waiting-room privacy.



\# 25. Demo Environment and Seed Data



Create a realistic demonstration environment.



Seed:



\- One doctor.

\- One active secretary.

\- One inactive secretary.

\- At least eight patients.

\- Several appointments.

\- Multiple active queue entries.

\- One Current patient.

\- One Ready patient.

\- One Late patient.

\- One Finished patient.

\- Several notification records.



Provide:



\- Demo credentials.

\- Demo \*\*OTP\*\* instructions.

\- Database reset/seed instructions.

\- Repeatable demo setup.



Create a reset mechanism that restores a predictable demo state without deleting unrelated production data.



Never run destructive reset commands automatically against production.



\# 26. Deployment



Deploy the entire application using Vercel and Supabase.



\## Vercel



Configure:



\- Production build.

\- Environment variables.

\- Server Actions.

\- Route Handlers.

\- Cron endpoint if applicable.

\- Correct frontend/backend URLs.



\## Supabase



Configure:



\- PostgreSQL.

\- Auth.

\- \*\*RLS\*\*.

\- Realtime.

\- \*\*SQL\*\* migrations.

\- Seed data.



Create:



```text .env.example ```



Document every required variable.



Do not commit actual credentials.



Check free-tier limits and deployment constraints.



Do not claim that a deployment succeeded unless you actually verified its \*\*URL\*\* and functionality.



If credentials are unavailable, finish the local application and provide exact deployment instructions.



\# 27. Execution Strategy



The deadline is tomorrow.



Prioritize an end-to-end working product over architectural perfection.



\## Phase 1 — Foundation



\## Inspect repository.



\## Initialize Next.js. ## Install dependencies. ## Configure Tailwind and shadcn/ui. ## Configure Supabase. ## Create SQL migrations. ## Implement authentication. ## Implement role-based authorization.



\## Phase 2 — Core Business Logic



\## Patient registration.



\## Doctor and secretary management. ## Doctor availability. ## Appointment booking. ## Walk-in registration. ## Queue engine. ## Expected-time calculations. ## Status transitions. ## Late policy.



\## Phase 3 — User Interfaces



\## Doctor/secretary dashboard.



\## Patient management. ## Appointment calendar. ## Queue management. ## Patient portal. ## Waiting-room display.



\## Phase 4 — Notifications and Realtime



\## Notification simulation.



\## Notification history. ## Threshold configuration. ## Queue realtime updates. ## Patient updates. ## Waiting-room synchronization.



\## Phase 5 — Demo and Deployment



\## Seed demo data.



\## Test all user roles. ## Test complete business workflow. ## Test mobile responsiveness. ## Run production build. ## Run tests. ## Deploy to Vercel. ## Connect Supabase production project. ## Verify deployed application.



After each major phase, run relevant tests and fix failures before proceeding.



Do not waste time running the complete production build after every tiny edit.



\# 28. Autonomous Agent Rules



You must:



\- Work directly in the repository.

\- Inspect existing files before modifying them.

\- Make reasonable technical decisions independently.

\- Avoid repeatedly asking for approval.

\- Keep implementation focused on the \*\*POC\*\*.

\- Use minimal dependencies.

\- Prefer simple solutions that can be explained.

\- Keep business logic out of UI components.

\- Validate all user input.

\- Handle errors consistently.

\- Verify database connectivity.

\- Run migrations.

\- Run tests.

\- Fix compilation errors.

\- Test all major routes.

\- Verify mobile responsiveness.

\- Maintain a concise \*\*README\*\*.

\- Maintain a PROJECT\_PLAN.md checklist and update it as work progresses.



Do not:



\- Stop after scaffolding.

\- Generate nonfunctional buttons.

\- Use hardcoded arrays as the real database.

\- Put business logic in frontend components.

\- Expose secrets.

\- Skip authorization.

\- Fake successful integrations.

\- Claim untested functionality is complete.



When a feature cannot reasonably be completed before the demo, implement the smallest honest working version and document its limitations.



\# 29. Final Acceptance Criteria



The following complete scenario must work:



\## Doctor logs in.



\## Doctor configures working days and hours. ## Doctor creates a secretary. ## Secretary logs in. ## Secretary registers a pregnant patient. ## Secretary adds the patient to today's queue. ## Patient registers using their phone number. ## Patient verifies a demonstration OTP. ## Patient logs in. ## Patient books an available appointment. ## Admin sees the appointment. ## Admin sees the updated queue. ## Expected consultation times are calculated correctly. ## Secretary changes patient statuses. ## Doctor finishes a consultation. ## The next patient becomes Current after staff confirmation. ## The next eligible patient becomes Ready. ## Queue estimates recalculate. ## Patient sees only their personal appointment information. ## Waiting-room display updates. ## Notification simulation creates an eligible notification. ## Unauthorized actions are rejected. ## Mobile layouts work correctly. ## The application can be deployed to Vercel.



\# 30. Final Deliverables



At completion, provide:



\## Complete source code.



\## Next.js project structure. ## Supabase SQL migrations. ## Database schema documentation. ## RLS policies. ## Seed script. ## Doctor demonstration credentials. ## Secretary demonstration credentials. ## Patient demonstration credentials. ## OTP demonstration instructions. ## Route and Server Action documentation. ## Automated tests and results. ## Environment variable template. ## Local development instructions. ## Vercel deployment instructions. ## Supabase configuration instructions. ## Known limitations. ## Architecture explanation. ## A step-by-step client demonstration script.



The final result must be a functional full-stack application, not a static prototype.



\---



\# FINAL INSTRUCTION



Start by inspecting the repository and available tools.



Then implement the application autonomously, phase by phase.



Prioritize a complete patient registration → appointment booking → queue management → consultation completion → waiting-room update workflow.



Make the UI polished enough to impress a real doctor, but never sacrifice functional correctness for visual appearance.



Build the smallest complete version first, then refine it.



Do not stop at generating the first version. Run the application, test the actual workflows, fix the issues, verify the database, and prepare the deployed demonstration.



\*\*The objective is to deliver a genuinely working, visually impressive, secure, mobile-responsive Mosa3da \*\*POC\*\* that can be presented to a real OB/\*\*GYN\*\* doctor tomorrow.\*\*



Take a deep breath and work on this problem step-by-step.


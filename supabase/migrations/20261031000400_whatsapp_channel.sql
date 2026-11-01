-- =============================================================================
-- Mosa3da — Migration 0005: WhatsApp link channel
--
-- 'whatsapp_link' = a reminder that staff send themselves from the clinic phone
-- with a one-tap wa.me link (free). Kept in its own file because a new enum
-- value cannot be used in the same transaction that adds it.
-- =============================================================================

alter type public.notification_channel add value if not exists 'whatsapp_link';

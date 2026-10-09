-- A separate entitlement from currencies/materials, redeemed by a critical save command.
ALTER TABLE system_mail_campaigns ADD COLUMN mythic_choice INTEGER NOT NULL DEFAULT 0 CHECK (mythic_choice BETWEEN 0 AND 10);

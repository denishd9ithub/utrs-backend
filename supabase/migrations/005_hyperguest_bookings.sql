-- HyperGuest partner booking support

-- Allow partner-only bookings (no villa_id)
ALTER TABLE bookings ALTER COLUMN villa_id DROP NOT NULL;

-- Add partner fields to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_reservation_id TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS partner_meta JSONB;

CREATE INDEX IF NOT EXISTS idx_bookings_partner_reservation ON bookings(partner_reservation_id);
CREATE INDEX IF NOT EXISTS idx_bookings_partner ON bookings(partner_id);

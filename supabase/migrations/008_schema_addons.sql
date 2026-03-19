-- Schema add-ons: FK, cancellation fields, user_id, guest fields, analytics

-- 1. Bookings: guest_id FK (referential integrity)
-- Clear orphan guest_ids first (bookings pointing to non-existent guests)
UPDATE bookings SET guest_id = NULL
WHERE guest_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM guests WHERE guests.id = bookings.guest_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookings_guest'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT fk_bookings_guest
      FOREIGN KEY (guest_id) REFERENCES guests(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 2. Bookings: user_id (who made the booking - for "my bookings")
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);

-- 3. Bookings: cancellation & refund fields
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(12, 2);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

-- 4. Guests: partner API fields (HyperGuest lead guest)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE guests ADD COLUMN IF NOT EXISTS address TEXT;

-- 5. Villa pricing: partner source (for margin analytics by partner)
ALTER TABLE villa_pricing ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id);
CREATE INDEX IF NOT EXISTS idx_villa_pricing_partner ON villa_pricing(partner_id);

-- 6. WhatsApp sessions: updated_at
ALTER TABLE whatsapp_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
DROP TRIGGER IF EXISTS whatsapp_sessions_updated_at ON whatsapp_sessions;
CREATE TRIGGER whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();   
                                      

-- Card authorization with conditional capture support
-- payment_method: card, upi, netbanking, wallet, emi
-- payment_status: authorized | captured | released | refunded

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status TEXT;

-- booking_failed: payment succeeded but platform/channel manager rejected (user gets money back)
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK (status IN (
  'pending', 'payment_initiated', 'paid', 'confirmed', 'cancelled', 'refunded', 'booking_failed'
));

CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);

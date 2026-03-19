-- Razorpay order tracking & webhook idempotency

-- Add razorpay_order_id to bookings
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT;
CREATE INDEX IF NOT EXISTS idx_bookings_razorpay_order ON bookings(razorpay_order_id);

-- Webhook idempotency: avoid duplicate processing on Razorpay retries
CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  UNIQUE(event_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_razorpay_webhook_events_lookup
  ON razorpay_webhook_events(event_type, entity_id);

-- Villa Aggregator MVP - WhatsApp messages for idempotency & audit
-- Run in Supabase SQL Editor (after 002)

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meta_message_id TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT,
  payload JSONB,
  status TEXT DEFAULT 'processed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_messages_meta_id ON whatsapp_messages(meta_message_id);
CREATE INDEX idx_whatsapp_messages_phone ON whatsapp_messages(phone_number);
CREATE INDEX idx_whatsapp_messages_created ON whatsapp_messages(created_at);

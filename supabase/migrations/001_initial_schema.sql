

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. PARTNERS (HyperGuest, Roibos)
CREATE TABLE partners (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  api_base_url TEXT,
  markup_percent DECIMAL(5,2) DEFAULT 15.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO partners (code, name, markup_percent) VALUES
  ('hyperguest', 'HyperGuest', 12.00),
  ('roibos', 'Roibos', 18.00);

-- Global default markup (used when partner not in rules)
CREATE TABLE markup_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_type TEXT NOT NULL CHECK (rule_type IN ('global', 'partner')),
  partner_id UUID REFERENCES partners(id),
  markup_percent DECIMAL(5,2) NOT NULL,
  min_price DECIMAL(12,2),
  max_price DECIMAL(12,2),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO markup_rules (rule_type, markup_percent) VALUES ('global', 15.00);


-- 2. MASTER VILLAS (Golden Record - De-duplicated)

CREATE TABLE villas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE,
  name TEXT NOT NULL,
  name_normalized TEXT,
  description TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  location TEXT,
  region TEXT,
  country TEXT DEFAULT 'India',
  max_guests INTEGER DEFAULT 1,
  bedrooms INTEGER,
  bathrooms INTEGER,
  amenities JSONB DEFAULT '[]',
  images JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  is_locked BOOLEAN DEFAULT false,
  locked_fields JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  is_hidden BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_villas_slug ON villas(slug);
CREATE INDEX idx_villas_location ON villas(location);
CREATE INDEX idx_villas_coords ON villas(latitude, longitude);
CREATE INDEX idx_villas_tags ON villas USING GIN(tags);
CREATE INDEX idx_villas_active ON villas(is_active) WHERE is_active = true;


-- 3. VILLA SOURCES (Mapping: Master Villa <-> Partner + External ID)
-- Winning source = lowest net rate

CREATE TABLE villa_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  villa_id UUID NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES partners(id),
  external_id TEXT NOT NULL,
  net_rate DECIMAL(12, 2),
  currency TEXT DEFAULT 'INR',
  raw_data JSONB,
  is_winning_source BOOLEAN DEFAULT false,
  UNIQUE(partner_id, external_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_villa_sources_villa ON villa_sources(villa_id);
CREATE INDEX idx_villa_sources_partner ON villa_sources(partner_id);
CREATE INDEX idx_villa_sources_winning ON villa_sources(villa_id, is_winning_source) WHERE is_winning_source = true;


-- 4. VILLA PRICING (Per date: Net Rate, Markup, Sell Rate)

CREATE TABLE villa_pricing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  villa_id UUID NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  source_date DATE NOT NULL,
  net_rate DECIMAL(12, 2) NOT NULL,
  markup_percent DECIMAL(5, 2) NOT NULL,
  sell_rate DECIMAL(12, 2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  is_safe BOOLEAN DEFAULT true,
  flag_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(villa_id, source_date)
);

CREATE INDEX idx_villa_pricing_villa_date ON villa_pricing(villa_id, source_date);
CREATE INDEX idx_villa_pricing_date ON villa_pricing(source_date);
CREATE INDEX idx_villa_pricing_unsafe ON villa_pricing(villa_id) WHERE is_safe = false;


-- 5. BOOKINGS

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_ref TEXT UNIQUE,
  villa_id UUID NOT NULL REFERENCES villas(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guests INTEGER NOT NULL,
  net_cost DECIMAL(12, 2),
  sell_price DECIMAL(12, 2),
  margin_amount DECIMAL(12, 2),
  margin_percent DECIMAL(5, 2),
  currency TEXT DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'payment_initiated', 'paid', 'confirmed', 'cancelled', 'refunded'
  )),
  payment_gateway TEXT,
  payment_id TEXT,
  guest_id UUID,
  source TEXT DEFAULT 'web',
  whatsapp_session_id TEXT,
  zoho_invoice_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_check_in ON bookings(check_in);
CREATE INDEX idx_bookings_ref ON bookings(booking_ref);
CREATE INDEX idx_bookings_paid ON bookings(status) WHERE status = 'paid';


-- 6. GUESTS (PII - Encrypted at rest via Supabase)

CREATE TABLE guests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT,
  phone TEXT,
  name TEXT,
  encrypted_data BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_guests_email ON guests(email);
CREATE INDEX idx_guests_phone ON guests(phone);


-- 7. WHATSAPP SESSIONS (24h free window tracking)

CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT UNIQUE NOT NULL,
  meta_conversation_id TEXT,
  last_message_at TIMESTAMPTZ,
  search_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_sessions_phone ON whatsapp_sessions(phone_number);


-- 8. SYNC LOGS (ETL audit trail)

CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  partner_id UUID REFERENCES partners(id),
  sync_type TEXT NOT NULL,
  status TEXT CHECK (status IN ('started', 'success', 'failed', 'partial')),
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- TRIGGERS: updated_at

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER partners_updated_at BEFORE UPDATE ON partners
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER villas_updated_at BEFORE UPDATE ON villas
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER villa_sources_updated_at BEFORE UPDATE ON villa_sources
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER villa_pricing_updated_at BEFORE UPDATE ON villa_pricing
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();
CREATE TRIGGER guests_updated_at BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- =============================================================================
-- RLS (Row Level Security) - Enable for production
-- =============================================================================
-- ALTER TABLE villas ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE guests ENABLE ROW LEVEL SECURITY;

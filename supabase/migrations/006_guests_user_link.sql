-- Link guests to auth users (logged-in user = guest)
ALTER TABLE guests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_guests_user_id ON guests(user_id);

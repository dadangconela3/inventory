-- Inventory Management System Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- DEPARTMENTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('production', 'indirect', 'other')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default departments
INSERT INTO departments (code, name, category) VALUES
  ('MOLDING', 'Molding', 'production'),
  ('PLATING', 'Plating', 'production'),
  ('PAINTING1', 'Painting 1', 'production'),
  ('PAINTING2', 'Painting 2', 'production'),
  ('PP', 'PP', 'indirect'),
  ('QC', 'QC', 'indirect'),
  ('QA', 'QA', 'indirect'),
  ('PPIC', 'PPIC', 'indirect'),
  ('LOGISTICS', 'Logistics', 'indirect'),
  ('SALES', 'Sales', 'other'),
  ('IT', 'IT', 'other'),
  ('GA', 'General Affairs', 'other'),
  ('FINANCE', 'Finance', 'other'),
  ('HRGA', 'HR & GA', 'other')
ON CONFLICT (code) DO NOTHING;

-- =============================================
-- PROFILES TABLE (linked to Supabase Auth)
-- =============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'admin_dept' CHECK (role IN ('admin_produksi', 'admin_indirect', 'admin_dept', 'supervisor', 'hrga')),
  department_id UUID REFERENCES departments(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'admin_dept')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  sku TEXT UNIQUE NOT NULL,
  unit TEXT NOT NULL,
  current_stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert sample items
INSERT INTO items (name, sku, unit, current_stock, min_stock) VALUES
  ('Sarung Tangan Karet', 'GLV-001', 'pasang', 100, 20),
  ('Masker N95', 'MSK-001', 'pcs', 200, 50),
  ('Safety Glasses', 'SFG-001', 'pcs', 50, 10),
  ('Helm Safety', 'HLM-001', 'pcs', 30, 5),
  ('Sepatu Safety', 'SHS-001', 'pasang', 25, 5),
  ('Jas Hujan', 'JKT-001', 'pcs', 40, 10),
  ('Earplug', 'EPL-001', 'set', 150, 30),
  ('Baju Kerja', 'WRK-001', 'pcs', 60, 15),
  ('Tali Pengaman', 'SFB-001', 'pcs', 20, 5),
  ('Hand Sanitizer 500ml', 'HSN-001', 'botol', 80, 20)
ON CONFLICT (sku) DO NOTHING;

-- =============================================
-- PICKUP BATCHES TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS pickup_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_date TIMESTAMPTZ NOT NULL,
  hrga_status TEXT DEFAULT 'pending' CHECK (hrga_status IN ('pending', 'approved', 'rejected')),
  hrga_signature_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- REQUESTS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_number TEXT UNIQUE NOT NULL,
  requester_id UUID REFERENCES profiles(id),
  dept_code TEXT REFERENCES departments(code),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved_spv', 'rejected', 'scheduled', 'completed')),
  rejection_reason TEXT,
  batch_id UUID REFERENCES pickup_batches(id),
  admin_signature_url TEXT,
  spv_signature_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- REQUEST ITEMS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS request_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES requests(id) ON DELETE CASCADE,
  item_id UUID REFERENCES items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

-- =============================================
-- NOTIFICATIONS TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- DOCUMENT SEQUENCE TABLE
-- =============================================
CREATE TABLE IF NOT EXISTS doc_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dept_code TEXT NOT NULL,
  year INTEGER NOT NULL,
  last_number INTEGER DEFAULT 0,
  UNIQUE(dept_code, year)
);

-- =============================================
-- FUNCTION: Get next document sequence number
-- =============================================
CREATE OR REPLACE FUNCTION get_next_doc_sequence(p_dept_code TEXT, p_year INTEGER)
RETURNS INTEGER AS $$
DECLARE
  v_next_number INTEGER;
BEGIN
  -- Insert or update sequence
  INSERT INTO doc_sequences (dept_code, year, last_number)
  VALUES (p_dept_code, p_year, 1)
  ON CONFLICT (dept_code, year)
  DO UPDATE SET last_number = doc_sequences.last_number + 1
  RETURNING last_number INTO v_next_number;
  
  RETURN v_next_number;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Departments: Everyone can read
CREATE POLICY "Departments are viewable by everyone" ON departments
  FOR SELECT USING (true);

-- Profiles: Users can view all profiles but only update their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Items: Everyone can read, HRGA can manage
CREATE POLICY "Items are viewable by everyone" ON items
  FOR SELECT USING (true);

CREATE POLICY "HRGA can manage items" ON items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Requests: Complex policies based on role
CREATE POLICY "Users can view requests" ON requests
  FOR SELECT USING (true);

CREATE POLICY "Users can create requests" ON requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Supervisors and HRGA can update requests" ON requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('supervisor', 'hrga')
    )
  );

-- Request Items: Same as requests
CREATE POLICY "Request items are viewable by everyone" ON request_items
  FOR SELECT USING (true);

CREATE POLICY "Users can create request items" ON request_items
  FOR INSERT WITH CHECK (true);

-- Pickup Batches
CREATE POLICY "Batches are viewable by everyone" ON pickup_batches
  FOR SELECT USING (true);

CREATE POLICY "Users can create batches" ON pickup_batches
  FOR INSERT WITH CHECK (true);

CREATE POLICY "HRGA can manage batches" ON pickup_batches
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Notifications: Users can only see their own
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- =============================================
-- REALTIME
-- =============================================
-- Enable realtime for notifications and requests
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE requests;

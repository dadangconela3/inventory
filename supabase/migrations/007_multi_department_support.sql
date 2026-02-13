-- =============================================
-- MULTI-DEPARTMENT SUPPORT
-- Migration: 007_multi_department_support.sql
-- Purpose: Enable users to be supervisors for multiple departments
-- =============================================

-- Create user_departments junction table
CREATE TABLE IF NOT EXISTS user_departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, department_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_user_departments_user_id ON user_departments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_departments_dept_id ON user_departments(department_id);

-- Migrate existing data from profiles.department_id to user_departments
-- This ensures backward compatibility
INSERT INTO user_departments (user_id, department_id, is_primary)
SELECT id, department_id, true
FROM profiles
WHERE department_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO NOTHING;

-- Enable RLS
ALTER TABLE user_departments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Everyone can view user-department relationships
CREATE POLICY "User departments are viewable by everyone" ON user_departments
  FOR SELECT USING (true);

-- Only HRGA can insert user-department relationships
CREATE POLICY "HRGA can insert user departments" ON user_departments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Only HRGA can update user-department relationships
CREATE POLICY "HRGA can update user departments" ON user_departments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Only HRGA can delete user-department relationships
CREATE POLICY "HRGA can delete user departments" ON user_departments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Helper function to get user's department codes as array
CREATE OR REPLACE FUNCTION get_user_department_codes(p_user_id UUID)
RETURNS TEXT[] AS $$
BEGIN
  RETURN ARRAY(
    SELECT d.code
    FROM user_departments ud
    JOIN departments d ON ud.department_id = d.id
    WHERE ud.user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function to check if user is supervisor of a department
CREATE OR REPLACE FUNCTION is_supervisor_of_department(p_user_id UUID, p_dept_code TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM user_departments ud
    JOIN departments d ON ud.department_id = d.id
    JOIN profiles p ON ud.user_id = p.id
    WHERE ud.user_id = p_user_id
      AND d.code = p_dept_code
      AND p.role = 'supervisor'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment for documentation
COMMENT ON TABLE user_departments IS 'Junction table for many-to-many relationship between users and departments. Allows supervisors to manage multiple departments.';
COMMENT ON COLUMN user_departments.is_primary IS 'Indicates the primary/main department for the user. Used for display purposes.';

-- Migration: 011_allow_departments_insert.sql
-- Purpose: Allow HRGA and authenticated users to insert departments if needed

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- Allow HRGA to insert new departments directly
DROP POLICY IF EXISTS "HRGA can insert departments" ON departments;
CREATE POLICY "HRGA can insert departments" ON departments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

-- Allow HRGA to update departments
DROP POLICY IF EXISTS "HRGA can update departments" ON departments;
CREATE POLICY "HRGA can update departments" ON departments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'hrga'
    )
  );

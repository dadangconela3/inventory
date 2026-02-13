-- =============================================
-- ASSIGN DIDIK TO MULTIPLE DEPARTMENTS
-- Migration: 008_assign_didik_departments.sql
-- Purpose: Assign user Didik as supervisor for QC, QA, and PP departments
-- =============================================

DO $$
DECLARE
  didik_id UUID;
  qc_id UUID;
  qa_id UUID;
  pp_id UUID;
BEGIN
  -- Find Didik's user ID (searching by name or email containing 'didik')
  SELECT id INTO didik_id 
  FROM profiles 
  WHERE LOWER(full_name) LIKE '%didik%' 
     OR LOWER(email) LIKE '%didik%'
     OR LOWER(username) LIKE '%didik%'
  LIMIT 1;
  
  IF didik_id IS NULL THEN
    RAISE NOTICE 'User Didik not found. Please create the user first or update this script with the correct identifier.';
    RETURN;
  END IF;
  
  -- Get department IDs
  SELECT id INTO qc_id FROM departments WHERE code = 'QC';
  SELECT id INTO qa_id FROM departments WHERE code = 'QA';
  SELECT id INTO pp_id FROM departments WHERE code = 'PP';
  
  IF qc_id IS NULL OR qa_id IS NULL OR pp_id IS NULL THEN
    RAISE EXCEPTION 'One or more departments (QC, QA, PP) not found in database';
  END IF;
  
  -- Remove any existing department assignments for Didik to avoid conflicts
  DELETE FROM user_departments WHERE user_id = didik_id;
  
  -- Assign Didik to three departments (QC as primary)
  INSERT INTO user_departments (user_id, department_id, is_primary) VALUES
    (didik_id, qc_id, true),   -- QC as primary department
    (didik_id, qa_id, false),  -- QA as secondary
    (didik_id, pp_id, false);  -- PP as secondary
  
  -- Update Didik's role to supervisor if not already
  UPDATE profiles 
  SET role = 'supervisor',
      department_id = qc_id  -- Keep for backward compatibility
  WHERE id = didik_id;
  
  RAISE NOTICE 'Successfully assigned Didik (ID: %) to departments: QC (primary), QA, PP', didik_id;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error assigning departments to Didik: %', SQLERRM;
    RAISE;
END $$;

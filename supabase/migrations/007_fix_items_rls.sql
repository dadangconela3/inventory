-- =====================================================
-- FIX RLS POLICIES FOR ITEMS TABLE
-- =====================================================
-- Run this in Supabase SQL Editor

-- Drop existing items policies
DROP POLICY IF EXISTS "Items are viewable by everyone" ON items;
DROP POLICY IF EXISTS "HRGA can manage items" ON items;
DROP POLICY IF EXISTS "Admin can insert items" ON items;

-- Enable RLS
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- 1. Everyone can view items
CREATE POLICY "Items are viewable by everyone" ON items
    FOR SELECT
    USING (true);

-- 2. HRGA can do everything with items
CREATE POLICY "HRGA can manage items" ON items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() AND p.role = 'hrga'
        )
    );

-- 3. Admin roles can INSERT new items (when creating from request form)
CREATE POLICY "Admin can insert items" ON items
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin_produksi', 'admin_indirect', 'admin_dept', 'hrga')
        )
    );

-- 4. Admin roles can UPDATE items they created (optional)
CREATE POLICY "Admin can update items" ON items
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM profiles p 
            WHERE p.id = auth.uid() 
            AND p.role IN ('admin_produksi', 'admin_indirect', 'admin_dept', 'hrga')
        )
    );

-- Verify policies
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'items';

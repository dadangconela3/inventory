-- =====================================================
-- DEMO USERS SETUP FOR INVENTORY MANAGEMENT SYSTEM
-- =====================================================
-- 
-- LANGKAH 1: Buat users di Supabase Dashboard
-- Go to: Authentication > Users > Add User
-- 
-- Buat akun-akun berikut dengan password: demo123456
--
-- | Email                      | Password    |
-- |----------------------------|-------------|
-- | admin.produksi@demo.com    | demo123456  |
-- | admin.indirect@demo.com    | demo123456  |
-- | admin.dept@demo.com        | demo123456  |
-- | supervisor.molding@demo.com| demo123456  |
-- | supervisor.ppic@demo.com   | demo123456  |
-- | hrga@demo.com              | demo123456  |
--
-- LANGKAH 2: Setelah users dibuat, jalankan SQL di bawah ini
-- untuk mengupdate profiles dengan role yang sesuai
-- =====================================================

-- Update profile untuk Admin Produksi (bisa akses Molding, Plating, Painting 1, Painting 2)
UPDATE profiles 
SET role = 'admin_produksi', 
    full_name = 'Admin Produksi',
    department_id = (SELECT id FROM departments WHERE code = 'MOLDING' LIMIT 1)
WHERE email = 'admin.produksi@demo.com';

-- Update profile untuk Admin Indirect (bisa akses PP, QC, QA, PPIC, Logistics)
UPDATE profiles 
SET role = 'admin_indirect', 
    full_name = 'Admin Indirect',
    department_id = (SELECT id FROM departments WHERE code = 'PPIC' LIMIT 1)
WHERE email = 'admin.indirect@demo.com';

-- Update profile untuk Admin Departemen (bisa akses departemen sendiri saja)
UPDATE profiles 
SET role = 'admin_dept', 
    full_name = 'Admin Departemen',
    department_id = (SELECT id FROM departments WHERE code = 'IT' LIMIT 1)
WHERE email = 'admin.dept@demo.com';

-- Update profile untuk Supervisor Molding
UPDATE profiles 
SET role = 'supervisor', 
    full_name = 'Supervisor Molding',
    department_id = (SELECT id FROM departments WHERE code = 'MOLDING' LIMIT 1)
WHERE email = 'supervisor.molding@demo.com';

-- Update profile untuk Supervisor PPIC
UPDATE profiles 
SET role = 'supervisor', 
    full_name = 'Supervisor PPIC',
    department_id = (SELECT id FROM departments WHERE code = 'PPIC' LIMIT 1)
WHERE email = 'supervisor.ppic@demo.com';

-- Update profile untuk HRGA (full access: Master Stock, OCR, Batch, Reports)
UPDATE profiles 
SET role = 'hrga', 
    full_name = 'HRGA Staff',
    department_id = (SELECT id FROM departments WHERE code = 'HRGA' LIMIT 1)
WHERE email = 'hrga@demo.com';

-- =====================================================
-- VERIFIKASI: Cek semua profiles yang sudah diupdate
-- =====================================================
SELECT 
    p.email,
    p.full_name,
    p.role,
    d.name as department
FROM profiles p
LEFT JOIN departments d ON p.department_id = d.id
ORDER BY p.role, p.email;

-- =====================================================
-- ROLE PERMISSIONS REFERENCE:
-- =====================================================
-- admin_produksi : Buat request untuk Molding, Plating, Painting 1, Painting 2
-- admin_indirect : Buat request untuk PP, QC, QA, PPIC, Logistics
-- admin_dept     : Buat request untuk departemen sendiri saja
-- supervisor     : Approve/Reject request di departemennya
-- hrga           : Master Stock, OCR Verify, Batch Scheduling, Reports, dll
-- =====================================================

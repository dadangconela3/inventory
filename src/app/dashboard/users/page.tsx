'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Department, UserRole } from '@/types/database';

interface UserDepartmentRelation {
    id: string;
    is_primary: boolean;
    department: { id: string; name: string; code: string };
}

interface UserWithDept {
    id: string;
    email: string;
    username?: string | null;
    full_name: string | null;
    role: UserRole;
    department_id: string | null; // Deprecated
    created_at: string;
    department?: { name: string; code: string }; // Deprecated
    user_departments?: UserDepartmentRelation[]; // NEW: Multiple departments
}

export default function UsersPage() {
    const [users, setUsers] = useState<UserWithDept[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<UserWithDept | null>(null);
    const [processing, setProcessing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
    const [resetPasswordUser, setResetPasswordUser] = useState<UserWithDept | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
    const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]); // NEW: for multi-department
    const [primaryDepartment, setPrimaryDepartment] = useState<string>(''); // NEW: primary dept

    // Form state
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        username: '',
        full_name: '',
        role: 'admin_dept' as string,
        department_id: '', // Deprecated, kept for backward compatibility
    });

    const roles = [
        { value: 'admin_produksi', label: 'Admin Produksi' },
        { value: 'admin_indirect', label: 'Admin Indirect' },
        { value: 'admin_dept', label: 'Admin Departemen' },
        { value: 'supervisor', label: 'Supervisor' },
        { value: 'hrga', label: 'HRGA' },
    ];

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [usersRes, deptRes] = await Promise.all([
                supabase
                    .from('profiles')
                    .select(`
                        *,
                        department:departments(name, code),
                        user_departments(
                            id,
                            is_primary,
                            department:departments(id, name, code)
                        )
                    `)
                    .order('created_at', { ascending: false }),
                supabase.from('departments').select('*').order('name'),
            ]);

            setUsers(usersRes.data || []);
            setDepartments(deptRes.data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (user?: UserWithDept) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                email: user.email,
                password: '', // Don't show password
                username: user.username || '',
                full_name: user.full_name || '',
                role: user.role,
                department_id: user.department_id || '',
            });
            
            // Load user's departments for multi-department editing
            if (user.user_departments && user.user_departments.length > 0) {
                const deptIds = user.user_departments.map(ud => ud.department.id);
                const primaryDept = user.user_departments.find(ud => ud.is_primary);
                setSelectedDepartments(deptIds);
                setPrimaryDepartment(primaryDept?.department.id || deptIds[0]);
            } else if (user.department_id) {
                // Fallback for single department
                setSelectedDepartments([user.department_id]);
                setPrimaryDepartment(user.department_id);
            } else {
                setSelectedDepartments([]);
                setPrimaryDepartment('');
            }
        } else {
            setEditingUser(null);
            setFormData({
                email: '',
                password: '',
                username: '',
                full_name: '',
                role: 'admin_dept',
                department_id: '',
            });
            setSelectedDepartments([]);
            setPrimaryDepartment('');
        }
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingUser(null);
        setFormData({
            email: '',
            password: '',
            username: '',
            full_name: '',
            role: 'admin_dept',
            department_id: '',
        });
        setSelectedDepartments([]);
        setPrimaryDepartment('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProcessing(true);

        try {
            const userId = editingUser?.id;

            if (editingUser) {
                // Update existing user profile
                const updateData = {
                    username: formData.username || null,
                    full_name: formData.full_name,
                    role: formData.role,
                    department_id: selectedDepartments.length > 0 ? primaryDepartment : null, // Set primary as main dept
                };

                console.log('Updating user with data:', updateData);

                const { error } = await supabase
                    .from('profiles')
                    .update(updateData)
                    .eq('id', editingUser.id);

                if (error) {
                    console.error('Update error:', error);
                    throw error;
                }

                // Update user_departments for multi-department support
                if (selectedDepartments.length > 0) {
                    // Delete existing department assignments
                    await supabase
                        .from('user_departments')
                        .delete()
                        .eq('user_id', editingUser.id);

                    // Insert new department assignments
                    const userDepartments = selectedDepartments.map(deptId => ({
                        user_id: editingUser.id,
                        department_id: deptId,
                        is_primary: deptId === primaryDepartment,
                    }));

                    const { error: deptError } = await supabase
                        .from('user_departments')
                        .insert(userDepartments);

                    if (deptError) {
                        console.error('Department assignment error:', deptError);
                        throw deptError;
                    }
                }

                alert('User berhasil diupdate!');
            } else {
                // Create new user via Supabase Auth
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: formData.email,
                    password: formData.password,
                    options: {
                        data: {
                            full_name: formData.full_name,
                            role: formData.role,
                        },
                    },
                });

                if (authError) {
                    if (authError.message.includes('already registered')) {
                        alert('Email sudah terdaftar');
                    } else {
                        alert(`Error: ${authError.message}`);
                    }
                    throw authError;
                }

                // Wait for the trigger to create the profile
                if (authData.user) {
                    // Wait a bit for the trigger to execute
                    await new Promise(resolve => setTimeout(resolve, 1000));

                    const profileData = {
                        id: authData.user.id,
                        email: formData.email,
                        username: formData.username || formData.email.split('@')[0],
                        full_name: formData.full_name,
                        role: formData.role,
                        department_id: selectedDepartments.length > 0 ? primaryDepartment : null,
                    };

                    console.log('Upserting profile with data:', profileData);

                    // Use upsert to handle both insert and update cases
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .upsert(profileData, { onConflict: 'id' });

                    if (profileError) {
                        console.error('Profile upsert error:', profileError);
                        alert(`Warning: User created but profile update failed: ${profileError.message}`);
                    }

                    // Insert user_departments for multi-department support
                    if (selectedDepartments.length > 0 && authData.user) {
                        const userDepartments = selectedDepartments.map(deptId => ({
                            user_id: authData.user!.id,
                            department_id: deptId,
                            is_primary: deptId === primaryDepartment,
                        }));

                        const { error: deptError } = await supabase
                            .from('user_departments')
                            .insert(userDepartments);

                        if (deptError) {
                            console.error('Department assignment error:', deptError);
                            // Don't throw, just log - user is already created
                        }
                    }
                }

                alert('User berhasil dibuat!');
            }

            handleCloseModal();
            fetchData();
        } catch (error) {
            console.error('Error saving user:', error);
        } finally {
            setProcessing(false);
        }
    };

    const handleDeleteUser = async (userId: string, userEmail: string) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus user ${userEmail}? User akan dihapus permanen dari sistem.`)) return;

        try {
            // Call the database function to delete user completely
            const { data, error } = await supabase
                .rpc('delete_user_completely', { user_id: userId });

            if (error) {
                console.error('Delete error:', error);
                if (error.message.includes('Only HRGA')) {
                    alert('Hanya HRGA yang dapat menghapus user');
                } else if (error.message.includes('Cannot delete your own')) {
                    alert('Tidak dapat menghapus akun sendiri');
                } else {
                    alert(`Gagal menghapus user: ${error.message}`);
                }
                return;
            }

            alert('User berhasil dihapus!');
            fetchData();
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('Gagal menghapus user');
        }
    };

    const handleResetPassword = async () => {
        if (!resetPasswordUser) return;
        if (!newPassword || newPassword.length < 6) {
            alert('Password minimal 6 karakter');
            return;
        }

        setProcessing(true);
        try {
            const { error } = await supabase.auth.admin.updateUserById(
                resetPasswordUser.id,
                { password: newPassword }
            );

            if (error) throw error;

            alert('Password berhasil direset!');
            setShowResetPasswordModal(false);
            setResetPasswordUser(null);
            setNewPassword('');
        } catch (error: any) {
            console.error('Error resetting password:', error);
            alert(`Gagal reset password: ${error.message}`);
        } finally {
            setProcessing(false);
        }
    };

    const openResetPasswordModal = (user: UserWithDept) => {
        setResetPasswordUser(user);
        setNewPassword('');
        setShowResetPasswordModal(true);
    };

    const toggleSelectUser = (userId: string) => {
        const newSet = new Set(selectedUsers);
        if (newSet.has(userId)) {
            newSet.delete(userId);
        } else {
            newSet.add(userId);
        }
        setSelectedUsers(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedUsers.size === filteredUsers.length) {
            setSelectedUsers(new Set());
        } else {
            setSelectedUsers(new Set(filteredUsers.map(u => u.id)));
        }
    };

    const handleBatchDelete = async () => {
        if (selectedUsers.size === 0) return;

        if (!confirm(`Apakah Anda yakin ingin menghapus ${selectedUsers.size} user? User akan dihapus permanen dari sistem.`)) return;

        setProcessing(true);
        try {
            let successCount = 0;
            let errorCount = 0;

            for (const userId of Array.from(selectedUsers)) {
                const { error } = await supabase
                    .rpc('delete_user_completely', { user_id: userId });

                if (error) {
                    console.error('Delete error for user:', userId, error);
                    errorCount++;
                } else {
                    successCount++;
                }
            }

            if (successCount > 0) {
                alert(`${successCount} user berhasil dihapus!${errorCount > 0 ? ` ${errorCount} gagal dihapus.` : ''}`);
                setSelectedUsers(new Set());
                fetchData();
            } else {
                alert('Gagal menghapus user');
            }
        } catch (error) {
            console.error('Error batch deleting users:', error);
            alert('Gagal menghapus user');
        } finally {
            setProcessing(false);
        }
    };

    const getRoleBadge = (role: string) => {
        const styles: Record<string, string> = {
            admin_produksi: 'bg-primary/10 text-primary',
            admin_indirect: 'bg-secondary/10 text-secondary',
            admin_dept: 'bg-info/10 text-info',
            supervisor: 'bg-warning/10 text-warning',
            hrga: 'bg-success/10 text-success',
        };

        const labels: Record<string, string> = {
            admin_produksi: 'Admin Produksi',
            admin_indirect: 'Admin Indirect',
            admin_dept: 'Admin Dept',
            supervisor: 'Supervisor',
            hrga: 'HRGA',
        };

        return (
            <span className={`badge ${styles[role] || 'bg-slate-100 text-slate-600'}`}>
                {labels[role] || role}
            </span>
        );
    };

    const filteredUsers = users.filter(user =>
        user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.username || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                        Manajemen User
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Kelola akun pengguna sistem
                    </p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="btn bg-primary text-white hover:bg-primary-focus dark:bg-accent dark:hover:bg-accent-focus"
                >
                    <svg className="mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Tambah User
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="card p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase text-slate-400 dark:text-navy-300">Total User</p>
                            <p className="text-2xl font-semibold text-slate-700 dark:text-navy-100">{users.length}</p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                            </svg>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase text-slate-400 dark:text-navy-300">Supervisor</p>
                            <p className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {users.filter(u => u.role === 'supervisor').length}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10 text-warning">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase text-slate-400 dark:text-navy-300">Admin</p>
                            <p className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {users.filter(u => u.role.includes('admin')).length}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info/10 text-info">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                        </div>
                    </div>
                </div>
                <div className="card p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-xs uppercase text-slate-400 dark:text-navy-300">HRGA</p>
                            <p className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                                {users.filter(u => u.role === 'hrga').length}
                            </p>
                        </div>
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Search & Table */}
            <div className="card">
                <div className="flex flex-col gap-4 border-b border-slate-200 p-4 dark:border-navy-600 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="font-medium text-slate-700 dark:text-navy-100">Daftar User</h3>
                    <div className="flex items-center gap-3">
                        {selectedUsers.size > 0 && (
                            <button
                                onClick={handleBatchDelete}
                                disabled={processing}
                                className="btn bg-error text-white hover:bg-error-focus disabled:opacity-50"
                            >
                                <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Hapus ({selectedUsers.size})
                            </button>
                        )}
                        <div className="relative">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari user..."
                                className="form-input w-full rounded-lg border border-slate-300 bg-transparent py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 dark:border-navy-450 sm:w-64"
                            />
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 dark:border-navy-600 dark:bg-navy-800">
                                <th className="px-4 py-3 text-left">
                                    <input
                                        type="checkbox"
                                        checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                                        onChange={toggleSelectAll}
                                        className="h-4 w-4 rounded border-2 border-slate-300 text-primary transition-all hover:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 checked:border-primary checked:bg-primary dark:border-navy-450 dark:checked:border-accent dark:checked:bg-accent"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">User</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">Username</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">Role</th>
                                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">Departemen</th>
                                <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <tr key={user.id} className={`border-b border-slate-100 dark:border-navy-700 ${selectedUsers.has(user.id) ? 'bg-primary/5 dark:bg-accent/5' : ''}`}>
                                    <td className="px-4 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedUsers.has(user.id)}
                                            onChange={() => toggleSelectUser(user.id)}
                                            className="h-4 w-4 rounded border-2 border-slate-300 text-primary transition-all hover:border-primary focus:ring-2 focus:ring-primary/20 focus:ring-offset-0 checked:border-primary checked:bg-primary dark:border-navy-450 dark:checked:border-accent dark:checked:bg-accent"
                                        />
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                <span className="text-sm font-medium">
                                                    {(user.full_name || user.email).charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-700 dark:text-navy-100">
                                                    {user.full_name || '-'}
                                                </p>
                                                <p className="text-xs text-slate-400 dark:text-navy-300">
                                                    {user.email}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-navy-200">
                                        {user.username || '-'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {getRoleBadge(user.role)}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-slate-600 dark:text-navy-200">
                                        {user.user_departments && user.user_departments.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                                {user.user_departments.map((ud) => (
                                                    <span
                                                        key={ud.id}
                                                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                                            ud.is_primary
                                                                ? 'bg-primary/20 text-primary dark:bg-accent/20 dark:text-accent'
                                                                : 'bg-slate-200 text-slate-700 dark:bg-navy-600 dark:text-navy-100'
                                                        }`}
                                                    >
                                                        {ud.department.code}
                                                        {ud.is_primary && ' ★'}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            user.department?.name || '-'
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            <button
                                                onClick={() => handleOpenModal(user)}
                                                className="rounded-lg p-2 text-info transition-colors hover:bg-info/10"
                                                title="Edit"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => openResetPasswordModal(user)}
                                                className="rounded-lg p-2 text-warning transition-colors hover:bg-warning/10"
                                                title="Reset Password"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(user.id, user.email)}
                                                className="rounded-lg p-2 text-error transition-colors hover:bg-error/10"
                                                title="Hapus"
                                            >
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 dark:text-navy-300">
                                        {searchQuery ? 'Tidak ada user yang cocok' : 'Belum ada user'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="mb-4 text-lg font-semibold text-slate-700 dark:text-navy-100">
                            {editingUser ? 'Edit User' : 'Tambah User Baru'}
                        </h3>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Email - only for new users */}
                            {!editingUser && (
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Email <span className="text-error">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                        required
                                    />
                                </div>
                            )}

                            {/* Password - only for new users */}
                            {!editingUser && (
                                <div>
                                    <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                        Password <span className="text-error">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                        minLength={6}
                                        required
                                    />
                                    <p className="mt-1 text-xs text-slate-400">Minimal 6 karakter</p>
                                </div>
                            )}

                            {/* Username */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    placeholder="Username untuk login"
                                />
                            </div>

                            {/* Full Name */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Nama Lengkap <span className="text-error">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={formData.full_name}
                                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    required
                                />
                            </div>

                            {/* Role */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Role <span className="text-error">*</span>
                                </label>
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="form-select w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                                    required
                                >
                                    {roles.map((role) => (
                                        <option key={role.value} value={role.value}>
                                            {role.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Departments - Multi-select with Primary */}
                            <div>
                                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                    Departemen
                                </label>
                                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-300 bg-slate-50 p-3 dark:border-navy-450 dark:bg-navy-800">
                                    {departments.length === 0 ? (
                                        <p className="text-sm text-slate-400">Tidak ada departemen</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {departments.map((dept) => {
                                                const isSelected = selectedDepartments.includes(dept.id);
                                                const isPrimary = primaryDepartment === dept.id;
                                                
                                                return (
                                                    <div key={dept.id} className="flex items-center gap-3 rounded-lg bg-white p-2 dark:bg-navy-700">
                                                        {/* Checkbox for selection */}
                                                        <input
                                                            type="checkbox"
                                                            id={`dept-${dept.id}`}
                                                            checked={isSelected}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    const newSelected = [...selectedDepartments, dept.id];
                                                                    setSelectedDepartments(newSelected);
                                                                    // Set as primary if first selection
                                                                    if (newSelected.length === 1) {
                                                                        setPrimaryDepartment(dept.id);
                                                                    }
                                                                } else {
                                                                    const newSelected = selectedDepartments.filter(id => id !== dept.id);
                                                                    setSelectedDepartments(newSelected);
                                                                    // Update primary if removing current primary
                                                                    if (isPrimary && newSelected.length > 0) {
                                                                        setPrimaryDepartment(newSelected[0]);
                                                                    } else if (newSelected.length === 0) {
                                                                        setPrimaryDepartment('');
                                                                    }
                                                                }
                                                            }}
                                                            className="form-checkbox h-4 w-4 rounded border-slate-400 text-primary focus:ring-primary dark:border-navy-400"
                                                        />
                                                        
                                                        {/* Department name */}
                                                        <label 
                                                            htmlFor={`dept-${dept.id}`}
                                                            className="flex-1 cursor-pointer text-sm font-medium text-slate-700 dark:text-navy-100"
                                                        >
                                                            {dept.code} - {dept.name}
                                                        </label>
                                                        
                                                        {/* Radio for primary */}
                                                        {isSelected && (
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type="radio"
                                                                    id={`primary-${dept.id}`}
                                                                    name="primary_department"
                                                                    checked={isPrimary}
                                                                    onChange={() => setPrimaryDepartment(dept.id)}
                                                                    className="form-radio h-4 w-4 text-warning focus:ring-warning"
                                                                />
                                                                <label 
                                                                    htmlFor={`primary-${dept.id}`}
                                                                    className="cursor-pointer text-xs text-slate-500 dark:text-navy-300"
                                                                >
                                                                    Primary
                                                                </label>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <p className="mt-1 text-xs text-slate-400">
                                    Pilih satu atau lebih departemen. Tandai salah satu sebagai primary.
                                </p>
                            </div>

                            {/* Buttons */}
                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    disabled={processing}
                                    className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={processing}
                                    className="btn bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent"
                                >
                                    {processing ? 'Menyimpan...' : editingUser ? 'Update' : 'Simpan'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetPasswordModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-navy-700">
                        <h3 className="text-lg font-semibold text-slate-700 dark:text-navy-100">
                            Reset Password
                        </h3>
                        <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                            Reset password untuk: {resetPasswordUser?.email}
                        </p>

                        <div className="mt-4">
                            <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                                Password Baru <span className="text-error">*</span>
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minimal 6 karakter"
                                className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 dark:border-navy-450"
                            />
                        </div>

                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowResetPasswordModal(false);
                                    setResetPasswordUser(null);
                                    setNewPassword('');
                                }}
                                disabled={processing}
                                className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleResetPassword}
                                disabled={processing || !newPassword}
                                className="btn bg-warning text-white hover:bg-warning-focus disabled:opacity-50"
                            >
                                {processing ? 'Memproses...' : 'Reset Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import TomSelect from 'tom-select';
import { Department } from '@/types/database';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface TomSelectDepartmentProps {
    departments: Department[];
    selectedDepartmentIds: string[];
    primaryDepartmentId?: string;
    onChange: (selectedIds: string[]) => void;
    onPrimaryChange: (primaryId: string) => void;
    onDepartmentCreated?: (newDept: Department) => void;
    placeholder?: string;
    disabled?: boolean;
}

export default function TomSelectDepartment({
    departments,
    selectedDepartmentIds,
    primaryDepartmentId,
    onChange,
    onPrimaryChange,
    onDepartmentCreated,
    placeholder = 'Pilih atau ketik untuk buat baru...',
    disabled = false,
}: TomSelectDepartmentProps) {
    const selectRef = useRef<HTMLSelectElement | null>(null);
    const tomSelectInstance = useRef<TomSelect | null>(null);
    const isInternalSync = useRef<boolean>(false);
    const [isCreatingDept, setIsCreatingDept] = useState(false);

    // Initialize TomSelect
    useEffect(() => {
        if (!selectRef.current) return;

        // Destroy any leftover instance
        if (tomSelectInstance.current) {
            tomSelectInstance.current.destroy();
            tomSelectInstance.current = null;
        }

        const optionsData = departments.map((dept) => ({
            id: dept.id,
            name: dept.name,
            code: dept.code,
            category: dept.category,
            displayLabel: `${dept.code} - ${dept.name}`,
        }));

        const ts = new TomSelect(selectRef.current, {
            plugins: {
                remove_button: {
                    title: 'Hapus departemen',
                },
            },
            valueField: 'id',
            labelField: 'name',
            searchField: ['name', 'code'],
            options: optionsData,
            items: selectedDepartmentIds,
            createOnBlur: false,
            persist: false,
            placeholder,
            maxItems: null,
            closeAfterSelect: false,
            // Custom create handler for automatic new department creation
            create: (input: string, callback: (data?: any) => void): boolean => {
                const trimmedInput = input.trim();
                if (!trimmedInput) {
                    return false;
                }

                setIsCreatingDept(true);
                (async () => {
                    try {
                        const { data: { session } } = await supabase.auth.getSession();
                        const token = session?.access_token;

                        const res = await fetch('/api/departments/create', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ name: trimmedInput }),
                        });

                        const result = await res.json();

                        if (!res.ok) {
                            toast.error(result.error || 'Gagal membuat departemen baru');
                            callback();
                            return;
                        }

                        const newDept: Department = result.department;

                        if (!result.isExisting) {
                            toast.success(`Departemen "${newDept.name}" (${newDept.code}) berhasil dibuat!`);
                        }

                        // Notify parent to update departments state
                        onDepartmentCreated?.(newDept);

                        // Provide item data to TomSelect
                        callback({
                            id: newDept.id,
                            name: newDept.name,
                            code: newDept.code,
                            category: newDept.category,
                            displayLabel: `${newDept.code} - ${newDept.name}`,
                        });
                    } catch (err: any) {
                        console.error('Error creating department from TomSelect:', err);
                        toast.error(err.message || 'Gagal membuat departemen');
                        callback();
                    } finally {
                        setIsCreatingDept(false);
                    }
                })();

                return true;
            },
            render: {
                option_create: (data: any, escape: any) => {
                    return `<div class="create cursor-pointer p-2.5 text-sm font-medium text-primary hover:bg-primary/10 dark:text-accent-light">
                        <span class="inline-flex items-center gap-1.5">
                            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Buat departemen baru: <strong>"${escape(data.input)}"</strong>
                        </span>
                    </div>`;
                },
                no_results: (data: any, escape: any) => {
                    return `<div class="no-results p-2.5 text-sm text-slate-400 dark:text-navy-300">
                        Tidak ada departemen yang cocok dengan "${escape(data.input)}"
                    </div>`;
                },
                item: (data: any, escape: any) => {
                    const label = data.code ? `${data.code} - ${data.name}` : (data.name || data.displayLabel || '');
                    return `<div class="item">
                        <span>${escape(label)}</span>
                    </div>`;
                },
                option: (data: any, escape: any) => {
                    const categoryBadge = data.category
                        ? `<span class="text-[10px] uppercase font-semibold text-slate-400 dark:text-navy-300 ml-2 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-navy-600">${escape(data.category)}</span>`
                        : '';
                    return `<div class="option flex items-center justify-between py-2 px-3">
                        <div class="flex items-center gap-1.5 truncate">
                            <span class="font-semibold text-slate-700 dark:text-navy-100">${escape(data.code || '')}</span>
                            <span class="text-slate-400 dark:text-navy-300">-</span>
                            <span class="text-slate-600 dark:text-navy-200">${escape(data.name || '')}</span>
                        </div>
                        ${categoryBadge}
                    </div>`;
                },
            },
        });

        // Listen for selection changes
        ts.on('change', (value: string | string[]) => {
            if (isInternalSync.current) return;

            const values = Array.isArray(value)
                ? value.filter(Boolean)
                : typeof value === 'string' && value.length > 0
                ? value.split(',').filter(Boolean)
                : [];

            onChange(values);

            // Auto-adjust primary department
            if (values.length === 1) {
                onPrimaryChange(values[0]);
            } else if (values.length > 1) {
                if (!primaryDepartmentId || !values.includes(primaryDepartmentId)) {
                    onPrimaryChange(values[0]);
                }
            } else {
                onPrimaryChange('');
            }
        });

        tomSelectInstance.current = ts;

        return () => {
            if (tomSelectInstance.current) {
                tomSelectInstance.current.destroy();
                tomSelectInstance.current = null;
            }
        };
    }, []); // Init once on mount

    // Sync options when departments prop updates
    useEffect(() => {
        if (!tomSelectInstance.current) return;
        const ts = tomSelectInstance.current;

        departments.forEach((dept) => {
            if (!ts.options[dept.id]) {
                ts.addOption({
                    id: dept.id,
                    name: dept.name,
                    code: dept.code,
                    category: dept.category,
                    displayLabel: `${dept.code} - ${dept.name}`,
                });
            } else {
                ts.updateOption(dept.id, {
                    id: dept.id,
                    name: dept.name,
                    code: dept.code,
                    category: dept.category,
                    displayLabel: `${dept.code} - ${dept.name}`,
                });
            }
        });

        ts.refreshOptions(false);
    }, [departments]);

    // Sync selected values when selectedDepartmentIds changes from parent
    useEffect(() => {
        if (!tomSelectInstance.current) return;
        const ts = tomSelectInstance.current;

        const currentVal = ts.getValue();
        const currentArr = Array.isArray(currentVal)
            ? currentVal.filter(Boolean)
            : typeof currentVal === 'string' && currentVal.length > 0
            ? currentVal.split(',').filter(Boolean)
            : [];

        const isDifferent =
            currentArr.length !== selectedDepartmentIds.length ||
            currentArr.some((id) => !selectedDepartmentIds.includes(id)) ||
            selectedDepartmentIds.some((id) => !currentArr.includes(id));

        if (isDifferent) {
            isInternalSync.current = true;
            ts.setValue(selectedDepartmentIds, true);
            setTimeout(() => {
                isInternalSync.current = false;
            }, 50);
        }
    }, [selectedDepartmentIds]);

    return (
        <div className="space-y-3">
            <div className="relative">
                <select
                    ref={selectRef}
                    multiple
                    disabled={disabled}
                    data-placeholder={placeholder}
                    className="w-full"
                    style={{ display: 'none' }}
                >
                    {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                            {dept.code} - {dept.name}
                        </option>
                    ))}
                </select>

                {isCreatingDept && (
                    <div className="absolute right-3 top-2.5 flex items-center gap-1.5 text-xs text-primary dark:text-accent-light">
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-r-transparent dark:border-accent-light"></div>
                        <span>Membuat departemen...</span>
                    </div>
                )}
            </div>

            {/* Helper tips */}
            <p className="text-xs text-slate-400 dark:text-navy-300">
                Pilih satu atau lebih departemen. Ketik nama baru untuk otomatis membuat departemen.
            </p>

            {/* Primary Department Selector */}
            {selectedDepartmentIds.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-navy-500/80 dark:bg-navy-800/60">
                    <div className="mb-2 flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700 dark:text-navy-100 flex items-center gap-1.5">
                            <span>Departemen Utama (Primary):</span>
                        </label>
                        <span className="text-[11px] text-slate-400 dark:text-navy-300">
                            {selectedDepartmentIds.length > 1
                                ? 'Klik salah satu untuk mengubah primary'
                                : 'Departemen utama user'}
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {selectedDepartmentIds.map((deptId) => {
                            const dept = departments.find((d) => d.id === deptId);
                            const isPrimary = deptId === primaryDepartmentId;
                            const deptName = dept ? `${dept.code} - ${dept.name}` : deptId;

                            return (
                                <button
                                    key={deptId}
                                    type="button"
                                    onClick={() => onPrimaryChange(deptId)}
                                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                                        isPrimary
                                            ? 'bg-primary text-white shadow-sm ring-2 ring-primary/30 dark:bg-accent dark:ring-accent/30'
                                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 dark:bg-navy-700 dark:text-navy-200 dark:border-navy-500 dark:hover:bg-navy-600'
                                    }`}
                                    title={isPrimary ? 'Departemen Utama' : 'Klik untuk jadikan Departemen Utama'}
                                >
                                    <span className={isPrimary ? 'text-amber-300' : 'text-slate-400 dark:text-navy-400'}>
                                        {isPrimary ? '★' : '☆'}
                                    </span>
                                    <span>{deptName}</span>
                                    {isPrimary && (
                                        <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                                            Primary
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

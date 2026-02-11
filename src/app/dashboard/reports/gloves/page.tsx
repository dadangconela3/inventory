'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import dynamic from 'next/dynamic';
import * as XLSX from 'xlsx';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface GlovesUsageData {
    request_date: string;
    dept_code: string;
    dept_name: string;
    item_name: string;
    quantity: number;
    unit: string;
    dozen_qty: number;
}

interface DeptSummary {
    dept_name: string;
    total_dozen: number;
}

export default function GlovesReportPage() {
    const [loading, setLoading] = useState(true);
    const [usageData, setUsageData] = useState<GlovesUsageData[]>([]);
    const [deptSummary, setDeptSummary] = useState<DeptSummary[]>([]);
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });

    const fetchGlovesData = useCallback(async () => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // Fetch requests with items that contain "sarung" or "glove"
            const { data: requests, error } = await supabase
                .from('requests')
                .select(`
                    id,
                    created_at,
                    dept_code,
                    status,
                    department:departments!dept_code(name),
                    items:request_items(
                        quantity,
                        item:items(name, unit)
                    )
                `)
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end + 'T23:59:59')
                .in('status', ['approved_spv', 'scheduled', 'completed']);

            if (error) throw error;

            // Process and filter data for gloves only
            const processedData: GlovesUsageData[] = [];
            
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (requests || []).forEach((req: any) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                req.items?.forEach((reqItem: any) => {
                    const itemName = reqItem.item?.name || '';
                    // Filter for items containing "sarung" or "glove" (case insensitive)
                    if (itemName.toLowerCase().includes('sarung') || itemName.toLowerCase().includes('glove')) {
                        const unit = reqItem.item?.unit || '';
                        const quantity = reqItem.quantity || 0;
                        
                        // Convert to dozen (if unit is "pasang", divide by 12)
                        let dozenQty = quantity;
                        if (unit.toLowerCase() === 'pasang') {
                            dozenQty = quantity / 12;
                        } else if (unit.toLowerCase() === 'lusin') {
                            dozenQty = quantity;
                        }

                        processedData.push({
                            request_date: new Date(req.created_at).toLocaleDateString('id-ID'),
                            dept_code: req.dept_code,
                            dept_name: req.department?.name || req.dept_code,
                            item_name: itemName,
                            quantity: quantity,
                            unit: unit,
                            dozen_qty: dozenQty,
                        });
                    }
                });
            });

            setUsageData(processedData);

            // Calculate department summary
            const deptMap = new Map<string, number>();
            processedData.forEach(item => {
                const current = deptMap.get(item.dept_name) || 0;
                deptMap.set(item.dept_name, current + item.dozen_qty);
            });

            const summary = Array.from(deptMap.entries())
                .map(([dept_name, total_dozen]) => ({ dept_name, total_dozen }))
                .sort((a, b) => b.total_dozen - a.total_dozen);

            setDeptSummary(summary);

        } catch (error) {
            console.error('Error fetching gloves data:', error);
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchGlovesData();
    }, [fetchGlovesData]);

    const exportToExcel = () => {
        // Prepare data for export
        const exportData = usageData.map(item => ({
            'Tanggal': item.request_date,
            'Departemen': item.dept_name,
            'Nama Barang': item.item_name,
            'Jumlah': item.quantity,
            'Satuan': item.unit,
            'Total (Lusin)': item.dozen_qty.toFixed(2),
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(exportData);
        
        // Set column widths
        ws['!cols'] = [
            { wch: 12 }, // Tanggal
            { wch: 20 }, // Departemen
            { wch: 30 }, // Nama Barang
            { wch: 10 }, // Jumlah
            { wch: 10 }, // Satuan
            { wch: 12 }, // Total (Lusin)
        ];

        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Laporan Sarung Tangan');

        // Generate file
        const fileName = `laporan-sarung-tangan-${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const chartOptions = {
        chart: {
            toolbar: { show: false },
            fontFamily: 'inherit',
        },
        colors: ['#4f46e5'],
        plotOptions: {
            bar: {
                borderRadius: 8,
                horizontal: false,
                columnWidth: '60%',
            },
        },
        dataLabels: {
            enabled: true,
            formatter: (val: number) => val.toFixed(1) + ' lusin',
        },
        xaxis: {
            categories: deptSummary.map(d => d.dept_name),
            labels: { 
                style: { colors: '#64748b' },
                rotate: -45,
                rotateAlways: false,
            },
        },
        yaxis: {
            title: { text: 'Jumlah (Lusin)' },
            labels: { 
                style: { colors: '#64748b' },
                formatter: (val: number) => val.toFixed(1),
            },
        },
        grid: {
            borderColor: '#e2e8f0',
            strokeDashArray: 4,
        },
        tooltip: { 
            theme: 'light',
            y: {
                formatter: (val: number) => val.toFixed(2) + ' lusin',
            },
        },
    };

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
                        Laporan Penggunaan Sarung Tangan
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Analisis penggunaan sarung tangan per departemen
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="form-input rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-navy-450 dark:bg-navy-700 dark:text-navy-100"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="form-input rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-navy-450 dark:bg-navy-700 dark:text-navy-100"
                        />
                    </div>

                    {/* Export Button */}
                    <button
                        onClick={exportToExcel}
                        disabled={usageData.length === 0}
                        className="btn bg-success text-white hover:bg-success-focus disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Export Excel
                    </button>
                </div>
            </div>

            {/* Bar Chart */}
            <div className="card p-5">
                <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                    Penggunaan Sarung Tangan per Departemen
                </h3>
                {deptSummary.length === 0 ? (
                    <div className="flex h-72 items-center justify-center text-slate-400 dark:text-navy-300">
                        Tidak ada data untuk periode ini
                    </div>
                ) : (
                    <div className="h-96">
                        {typeof window !== 'undefined' && (
                            <Chart
                                options={chartOptions}
                                series={[{ name: 'Jumlah (Lusin)', data: deptSummary.map(d => d.total_dozen) }]}
                                type="bar"
                                height="100%"
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Detail Table */}
            <div className="card">
                <div className="border-b border-slate-150 p-5 dark:border-navy-600">
                    <h3 className="text-lg font-medium text-slate-700 dark:text-navy-100">
                        Detail Penggunaan
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Tanggal
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Departemen
                                </th>
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Nama Barang
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Jumlah
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Satuan
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Total (Lusin)
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {usageData.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                        Tidak ada data untuk periode ini
                                    </td>
                                </tr>
                            ) : (
                                usageData.map((item, index) => (
                                    <tr key={index} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                                        <td className="px-5 py-4 text-slate-600 dark:text-navy-200">
                                            {item.request_date}
                                        </td>
                                        <td className="px-5 py-4 font-medium text-slate-700 dark:text-navy-100">
                                            {item.dept_name}
                                        </td>
                                        <td className="px-5 py-4 text-slate-600 dark:text-navy-200">
                                            {item.item_name}
                                        </td>
                                        <td className="px-5 py-4 text-center text-slate-600 dark:text-navy-200">
                                            {item.quantity}
                                        </td>
                                        <td className="px-5 py-4 text-center text-slate-600 dark:text-navy-200">
                                            {item.unit}
                                        </td>
                                        <td className="px-5 py-4 text-center font-medium text-primary dark:text-accent">
                                            {item.dozen_qty.toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Request, RequestStatus } from '@/types/database';

// Dynamic import for ApexCharts to avoid SSR issues
import dynamic from 'next/dynamic';
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

interface DeptStats {
    dept_code: string;
    dept_name: string;
    total_requests: number;
    approved: number;
    pending: number;
    rejected: number;
}

export default function ReportsPage() {
    const [loading, setLoading] = useState(true);
    const [deptStats, setDeptStats] = useState<DeptStats[]>([]);
    const [monthlyData, setMonthlyData] = useState<{ month: string; count: number }[]>([]);
    const [statusData, setStatusData] = useState<{ status: string; count: number }[]>([]);
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
    });

    useEffect(() => {
        fetchReportData();
    }, [dateRange]);

    const fetchReportData = async () => {
        if (!isSupabaseConfigured) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            // Fetch all requests within date range
            const { data: requests, error } = await supabase
                .from('requests')
                .select('*, department:departments!dept_code(name)')
                .gte('created_at', dateRange.start)
                .lte('created_at', dateRange.end + 'T23:59:59');

            if (error) throw error;

            // Calculate department stats
            const deptMap = new Map<string, DeptStats>();
            (requests || []).forEach((req: any) => {
                const code = req.dept_code;
                if (!deptMap.has(code)) {
                    deptMap.set(code, {
                        dept_code: code,
                        dept_name: req.department?.name || code,
                        total_requests: 0,
                        approved: 0,
                        pending: 0,
                        rejected: 0,
                    });
                }
                const stats = deptMap.get(code)!;
                stats.total_requests++;
                if (req.status === 'approved_spv' || req.status === 'scheduled' || req.status === 'completed') {
                    stats.approved++;
                } else if (req.status === 'pending') {
                    stats.pending++;
                } else if (req.status === 'rejected') {
                    stats.rejected++;
                }
            });
            setDeptStats(Array.from(deptMap.values()).sort((a, b) => b.total_requests - a.total_requests));

            // Calculate monthly data
            const monthMap = new Map<string, number>();
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            (requests || []).forEach((req: any) => {
                const date = new Date(req.created_at);
                const monthKey = months[date.getMonth()];
                monthMap.set(monthKey, (monthMap.get(monthKey) || 0) + 1);
            });
            setMonthlyData(months.map(m => ({ month: m, count: monthMap.get(m) || 0 })));

            // Calculate status distribution
            const statusMap = new Map<string, number>();
            (requests || []).forEach((req: any) => {
                statusMap.set(req.status, (statusMap.get(req.status) || 0) + 1);
            });
            setStatusData(Array.from(statusMap.entries()).map(([status, count]) => ({ status, count })));

        } catch (error) {
            console.error('Error fetching report data:', error);
        } finally {
            setLoading(false);
        }
    };

    const statusLabels: Record<string, string> = {
        pending: 'Menunggu',
        approved_spv: 'Disetujui',
        rejected: 'Ditolak',
        scheduled: 'Terjadwal',
        completed: 'Selesai',
    };

    const exportToCSV = () => {
        let csv = 'Departemen,Total Request,Disetujui,Menunggu,Ditolak\n';
        deptStats.forEach(row => {
            csv += `"${row.dept_name}",${row.total_requests},${row.approved},${row.pending},${row.rejected}\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `laporan-inventory-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const chartOptions = {
        chart: {
            toolbar: { show: false },
            fontFamily: 'inherit',
        },
        colors: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444'],
        dataLabels: { enabled: false },
        stroke: { curve: 'smooth' as const, width: 3 },
        xaxis: {
            categories: monthlyData.map(d => d.month),
            labels: { style: { colors: '#64748b' } },
        },
        yaxis: {
            labels: { style: { colors: '#64748b' } },
        },
        grid: {
            borderColor: '#e2e8f0',
            strokeDashArray: 4,
        },
        tooltip: { theme: 'light' },
    };

    const pieOptions = {
        chart: { fontFamily: 'inherit' },
        colors: ['#f59e0b', '#10b981', '#ef4444', '#0ea5e9', '#6b7280'],
        labels: statusData.map(d => statusLabels[d.status] || d.status),
        legend: { position: 'bottom' as const },
        dataLabels: { enabled: true },
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
                        Laporan & Statistik
                    </h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                        Analisis penggunaan inventory per departemen
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* Date Range */}
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                            className="form-input rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-navy-450"
                        />
                        <span className="text-slate-400">-</span>
                        <input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                            className="form-input rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-navy-450"
                        />
                    </div>

                    {/* Export Button */}
                    <button
                        onClick={exportToCSV}
                        className="btn border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200"
                    >
                        <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export CSV
                    </button>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid gap-6 lg:grid-cols-2">
                {/* Monthly Trend */}
                <div className="card p-5">
                    <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                        Tren Bulanan Request
                    </h3>
                    <div className="h-72">
                        {typeof window !== 'undefined' && (
                            <Chart
                                options={chartOptions}
                                series={[{ name: 'Request', data: monthlyData.map(d => d.count) }]}
                                type="area"
                                height="100%"
                            />
                        )}
                    </div>
                </div>

                {/* Status Distribution */}
                <div className="card p-5">
                    <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                        Distribusi Status
                    </h3>
                    <div className="h-72">
                        {typeof window !== 'undefined' && statusData.length > 0 && (
                            <Chart
                                options={pieOptions}
                                series={statusData.map(d => d.count)}
                                type="donut"
                                height="100%"
                            />
                        )}
                    </div>
                </div>
            </div>

            {/* Department Stats Table */}
            <div className="card">
                <div className="border-b border-slate-150 p-5 dark:border-navy-600">
                    <h3 className="text-lg font-medium text-slate-700 dark:text-navy-100">
                        Statistik per Departemen
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-150 dark:border-navy-600">
                                <th className="px-5 py-4 text-left text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Departemen
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Total Request
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Disetujui
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Menunggu
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Ditolak
                                </th>
                                <th className="px-5 py-4 text-center text-xs font-semibold uppercase text-slate-500 dark:text-navy-300">
                                    Approval Rate
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {deptStats.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center text-slate-400 dark:text-navy-300">
                                        Tidak ada data untuk periode ini
                                    </td>
                                </tr>
                            ) : (
                                deptStats.map((dept) => {
                                    const rate = dept.total_requests > 0
                                        ? Math.round((dept.approved / dept.total_requests) * 100)
                                        : 0;
                                    return (
                                        <tr key={dept.dept_code} className="border-b border-slate-100 last:border-0 dark:border-navy-700">
                                            <td className="px-5 py-4 font-medium text-slate-700 dark:text-navy-100">
                                                {dept.dept_name}
                                            </td>
                                            <td className="px-5 py-4 text-center text-slate-600 dark:text-navy-200">
                                                {dept.total_requests}
                                            </td>
                                            <td className="px-5 py-4 text-center text-success">
                                                {dept.approved}
                                            </td>
                                            <td className="px-5 py-4 text-center text-warning">
                                                {dept.pending}
                                            </td>
                                            <td className="px-5 py-4 text-center text-error">
                                                {dept.rejected}
                                            </td>
                                            <td className="px-5 py-4 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="h-2 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-navy-500">
                                                        <div
                                                            className="h-full bg-success"
                                                            style={{ width: `${rate}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-sm text-slate-600 dark:text-navy-200">
                                                        {rate}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

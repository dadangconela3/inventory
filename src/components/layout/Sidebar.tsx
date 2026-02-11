'use client';

import { useState, memo } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { UserRole } from '@/types/database';

interface SidebarProps {
    userRole: UserRole;
    userName?: string;
}

interface NavItem {
    name: string;
    href: string;
    icon: React.ReactNode;
    roles: UserRole[];
}

const navItems: NavItem[] = [
    {
        name: 'Dashboard',
        href: '/dashboard',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M5 14.059c0-1.01 0-1.514.222-1.945.221-.43.632-.724 1.453-1.31l4.163-2.974c.56-.4.842-.601 1.162-.601.32 0 .601.2 1.162.601l4.163 2.974c.821.586 1.232.88 1.453 1.31.222.43.222.935.222 1.945V19c0 .943 0 1.414-.293 1.707C18.414 21 17.943 21 17 21H7c-.943 0-1.414 0-1.707-.293C5 20.414 5 19.943 5 19v-4.94Z"
                    fill="currentColor"
                />
                <path
                    d="M3 12.387c0 .267 0 .4.084.441.084.041.19-.04.4-.204l7.288-5.669c.59-.459.885-.688 1.228-.688.343 0 .638.23 1.228.688l7.288 5.669c.21.163.316.245.4.204.084-.04.084-.174.084-.441v-.409c0-.48 0-.72-.102-.928-.101-.208-.291-.355-.67-.65l-7-5.445c-.59-.459-.885-.688-1.228-.688-.343 0-.638.23-1.228.688l-7 5.445c-.379.295-.569.442-.67.65-.102.208-.102.448-.102.928v.409Z"
                    fill="currentColor"
                />
            </svg>
        ),
        roles: ['admin_produksi', 'admin_indirect', 'admin_dept', 'supervisor', 'hrga'],
    },
    {
        name: 'Buat Request',
        href: '/dashboard/requests/new',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
                    fill="currentColor"
                />
                <path
                    d="M12 8V16M8 12H16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        ),
        roles: ['admin_produksi', 'admin_indirect', 'admin_dept'],
    },
    {
        name: 'Daftar Request',
        href: '/dashboard/requests',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M3 6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V6Z"
                    fill="currentColor"
                />
                <path d="M7 9H17M7 13H17M7 17H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        roles: ['admin_produksi', 'admin_indirect', 'admin_dept', 'supervisor', 'hrga'],
    },
    {
        name: 'Approval',
        href: '/dashboard/approvals',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    fill="currentColor"
                />
                <path
                    d="M9 12L11 14L15 10"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        ),
        roles: ['supervisor'],
    },
    {
        name: 'Jadwal Batch',
        href: '/dashboard/batches',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M3 10H21V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V10Z"
                    fill="currentColor"
                />
                <path
                    d="M3 6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V10H3V6Z"
                    fill="currentColor"
                />
                <path d="M8 2V6M16 2V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        roles: ['admin_produksi', 'admin_indirect', 'admin_dept', 'hrga'],
    },
    {
        name: 'Master Stok',
        href: '/dashboard/stock',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M20 7H4C2.89543 7 2 7.89543 2 9V19C2 20.1046 2.89543 21 4 21H20C21.1046 21 22 20.1046 22 19V9C22 7.89543 21.1046 7 20 7Z"
                    fill="currentColor"
                />
                <path
                    d="M16 7V5C16 3.89543 15.1046 3 14 3H10C8.89543 3 8 3.89543 8 5V7"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                <path d="M12 11V17M9 14H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        roles: ['hrga'],
    },
    {
        name: 'Barang Masuk',
        href: '/dashboard/incoming',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M3 9L12 2L21 9V20C21 20.5304 20.7893 21.0391 20.4142 21.4142C20.0391 21.7893 19.5304 22 19 22H5C4.46957 22 3.96086 21.7893 3.58579 21.4142C3.21071 21.0391 3 20.5304 3 20V9Z"
                    fill="currentColor"
                />
                <path d="M9 22V12H15V22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        roles: ['hrga'],
    },
    {
        name: 'Verifikasi OCR',
        href: '/dashboard/ocr-verify',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z"
                    fill="currentColor"
                />
                <path d="M8 8H16M8 12H14M8 16H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        roles: ['hrga'],
    },
    {
        name: 'Laporan',
        href: '/dashboard/reports',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V4Z"
                    fill="currentColor"
                />
                <path d="M9 7H15M9 11H15M9 15H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        roles: ['hrga'],
    },
    {
        name: 'Laporan Sarung Tangan',
        href: '/dashboard/reports/gloves',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M5 4C5 2.89543 5.89543 2 7 2H17C18.1046 2 19 2.89543 19 4V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V4Z"
                    fill="currentColor"
                />
                <path d="M9 7H15M9 11H15M9 15H12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        roles: ['hrga'],
    },
    {
        name: 'Manajemen User',
        href: '/dashboard/users',
        icon: (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                    fillOpacity="0.3"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    fill="currentColor"
                />
                <path
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </svg>
        ),
        roles: ['hrga'],
    },
];

function Sidebar({ userRole, userName }: SidebarProps) {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(false);

    // Filter nav items based on user role
    const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/50 lg:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Mobile Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-white lg:hidden"
            >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isOpen ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    )}
                </svg>
            </button>

            {/* Sidebar */}
            <aside
                className={`fixed left-0 top-0 z-50 h-full w-64 transform bg-white shadow-soft transition-transform duration-300 dark:bg-navy-800 lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                {/* Logo */}
                <div className="flex h-16 items-center justify-center border-b border-slate-150 dark:border-navy-600">
                    <div className="flex items-center justify-center px-4">
                        <Image 
                            src="/sakaeriken inventory.png" 
                            alt="Sakaeriken Inventory Logo" 
                            width={180}
                            height={48}
                            priority
                            className="h-12 w-auto object-contain"
                        />
                    </div>
                </div>

                {/* Navigation */}
                <nav className="is-scrollbar-hidden h-[calc(100%-8rem)] overflow-y-auto p-4">
                    <ul className="space-y-1">
                        {visibleItems.map((item) => {
                            const isActive = pathname === item.href;
                            return (
                                <li key={item.href}>
                                    <Link
                                        href={item.href}
                                        className={`flex items-center space-x-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${isActive
                                            ? 'bg-primary text-white dark:bg-accent'
                                            : 'text-slate-600 hover:bg-slate-100 dark:text-navy-200 dark:hover:bg-navy-600'
                                            }`}
                                    >
                                        <span className={isActive ? 'text-white' : 'text-slate-400 dark:text-navy-300'}>
                                            {item.icon}
                                        </span>
                                        <span>{item.name}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* User Section */}
                <div className="absolute bottom-0 left-0 right-0 border-t border-slate-150 p-4 dark:border-navy-600">
                    <div className="flex items-center space-x-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 dark:bg-navy-500">
                            <span className="text-sm font-medium text-slate-600 dark:text-navy-100">
                                {userName?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        </div>
                        <div className="flex-1 truncate">
                            <p className="truncate text-sm font-medium text-slate-700 dark:text-navy-100">
                                {userName || 'User'}
                            </p>
                            <p className="truncate text-xs text-slate-400 dark:text-navy-300">
                                {userRole.replace('_', ' ').toUpperCase()}
                            </p>
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default memo(Sidebar);

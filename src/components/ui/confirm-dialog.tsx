'use client';

import React from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string | React.ReactNode;
    confirmText?: string;
    cancelText?: string;
    variant?: 'destructive' | 'primary';
    loading?: boolean;
    onConfirm: () => Promise<void> | void;
}

export function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmText = 'Lanjutkan',
    cancelText = 'Batal',
    variant = 'destructive',
    loading = false,
    onConfirm,
}: ConfirmDialogProps) {
    const handleConfirm = async (e: React.MouseEvent) => {
        e.preventDefault();
        await onConfirm();
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={loading}>{cancelText}</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleConfirm}
                        disabled={loading}
                        className={
                            variant === 'destructive'
                                ? 'bg-error text-white hover:bg-error-focus focus:bg-error-focus active:bg-error-focus'
                                : 'bg-primary text-white hover:bg-primary-focus focus:bg-primary-focus active:bg-primary-focus'
                        }
                    >
                        {loading ? 'Memproses...' : confirmText}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

export default ConfirmDialog;

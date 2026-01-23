'use client';

import { useRef, useEffect, useState } from 'react';
import SignaturePadLib from 'signature_pad';

interface SignaturePadProps {
    onSave: (signatureData: string) => void;
    onClear?: () => void;
    width?: number;
    height?: number;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    initialSignature?: string;
}

export default function SignaturePad({
    onSave,
    onClear,
    width = 400,
    height = 200,
    label = 'Tanda Tangan',
    required = false,
    disabled = false,
    initialSignature,
}: SignaturePadProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const signaturePadRef = useRef<SignaturePadLib | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);

        canvas.width = width * ratio;
        canvas.height = height * ratio;
        canvas.getContext('2d')?.scale(ratio, ratio);

        signaturePadRef.current = new SignaturePadLib(canvas, {
            backgroundColor: 'rgb(255, 255, 255)',
            penColor: 'rgb(0, 0, 0)',
        });

        if (disabled) {
            signaturePadRef.current.off();
        }

        // Load initial signature if provided
        if (initialSignature) {
            signaturePadRef.current.fromDataURL(initialSignature);
            setIsEmpty(false);
        }

        // Listen for changes
        signaturePadRef.current.addEventListener('endStroke', () => {
            setIsEmpty(signaturePadRef.current?.isEmpty() ?? true);
        });

        return () => {
            signaturePadRef.current?.off();
        };
    }, [width, height, disabled, initialSignature]);

    const handleClear = () => {
        signaturePadRef.current?.clear();
        setIsEmpty(true);
        onClear?.();
    };

    const handleSave = () => {
        if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
            const dataUrl = signaturePadRef.current.toDataURL('image/png');
            onSave(dataUrl);
        }
    };

    return (
        <div className="space-y-2">
            {/* Label */}
            <label className="block text-sm font-medium text-slate-600 dark:text-navy-100">
                {label} {required && <span className="text-error">*</span>}
            </label>

            {/* Canvas Container */}
            <div className="relative overflow-hidden rounded-lg border-2 border-dashed border-slate-300 bg-white dark:border-navy-500">
                <canvas
                    ref={canvasRef}
                    style={{ width: `${width}px`, height: `${height}px` }}
                    className={`touch-none ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair'}`}
                />

                {/* Watermark */}
                {isEmpty && !disabled && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <p className="text-sm text-slate-400">
                            Gambar tanda tangan di sini
                        </p>
                    </div>
                )}
            </div>

            {/* Actions */}
            {!disabled && (
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={handleClear}
                        className="btn border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-navy-450 dark:text-navy-200 dark:hover:bg-navy-500"
                    >
                        <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        Hapus
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isEmpty}
                        className="btn bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
                    >
                        <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Simpan Tanda Tangan
                    </button>
                </div>
            )}
        </div>
    );
}

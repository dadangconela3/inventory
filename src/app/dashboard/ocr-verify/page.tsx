'use client';

import { useState, useCallback } from 'react';
import { createWorker } from 'tesseract.js';
import { supabase } from '@/lib/supabase';
import { Item } from '@/types/database';

interface ExtractedItem {
    name: string;
    quantity: number;
    confirmed: boolean;
    item_id?: string;
}

export default function OcrVerifyPage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string>('');
    const [extractedText, setExtractedText] = useState<string>('');
    const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    // Fetch items for matching
    const fetchItems = async () => {
        const { data } = await supabase.from('items').select('*');
        setItems(data || []);
        return data || [];
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setPreview(URL.createObjectURL(selectedFile));
            setExtractedText('');
            setExtractedItems([]);
        }
    };

    const processOCR = async () => {
        if (!file) return;

        setLoading(true);
        setProgress(0);

        try {
            // Fetch items first
            const itemsList = await fetchItems();

            // Create Tesseract worker
            const worker = await createWorker('ind', 1, {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        setProgress(Math.round(m.progress * 100));
                    }
                },
            });

            // Recognize text
            const { data: { text } } = await worker.recognize(file);
            setExtractedText(text);

            // Parse extracted text for item patterns
            // Looking for patterns like: "Item Name - 10 pcs" or "10 x Item Name"
            const lines = text.split('\n').filter(line => line.trim());
            const parsed: ExtractedItem[] = [];

            for (const line of lines) {
                // Try to extract quantity and item name
                const qtyMatch = line.match(/(\d+)\s*(pcs|unit|pasang|set|buah|botol)?/i);
                if (qtyMatch) {
                    const quantity = parseInt(qtyMatch[1], 10);
                    const name = line.replace(qtyMatch[0], '').trim();

                    if (name && quantity > 0) {
                        // Try to match with existing items
                        const matchedItem = itemsList.find(item =>
                            item.name.toLowerCase().includes(name.toLowerCase()) ||
                            name.toLowerCase().includes(item.name.toLowerCase())
                        );

                        parsed.push({
                            name: matchedItem?.name || name,
                            quantity,
                            confirmed: false,
                            item_id: matchedItem?.id,
                        });
                    }
                }
            }

            setExtractedItems(parsed);
            await worker.terminate();
        } catch (error) {
            console.error('OCR Error:', error);
            alert('Gagal memproses gambar. Silakan coba lagi.');
        } finally {
            setLoading(false);
        }
    };

    const updateExtractedItem = (index: number, field: keyof ExtractedItem, value: any) => {
        setExtractedItems(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], [field]: value };
            return updated;
        });
    };

    const confirmItem = (index: number) => {
        updateExtractedItem(index, 'confirmed', true);
    };

    const handleSubmitVerification = async () => {
        const confirmedItems = extractedItems.filter(item => item.confirmed && item.item_id);

        if (confirmedItems.length === 0) {
            alert('Tidak ada item yang dikonfirmasi');
            return;
        }

        setProcessing(true);
        try {
            // Update stock for each confirmed item
            for (const item of confirmedItems) {
                const { error } = await supabase
                    .from('items')
                    .update({
                        current_stock: supabase.rpc('increment_stock', {
                            row_id: item.item_id,
                            amount: item.quantity
                        })
                    })
                    .eq('id', item.item_id);

                // Alternative: Direct update (simpler)
                const { data: currentItem } = await supabase
                    .from('items')
                    .select('current_stock')
                    .eq('id', item.item_id)
                    .single();

                if (currentItem) {
                    await supabase
                        .from('items')
                        .update({ current_stock: currentItem.current_stock + item.quantity })
                        .eq('id', item.item_id);
                }
            }

            alert('Stok berhasil diperbarui!');
            setFile(null);
            setPreview('');
            setExtractedText('');
            setExtractedItems([]);
        } catch (error) {
            console.error('Error updating stock:', error);
            alert('Gagal memperbarui stok. Silakan coba lagi.');
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-semibold text-slate-700 dark:text-navy-100">
                    Verifikasi OCR Surat Jalan
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-navy-300">
                    Upload surat jalan untuk ekstrak data barang secara otomatis
                </p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Upload Section */}
                <div className="card p-6">
                    <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                        Upload Surat Jalan
                    </h3>

                    {/* File Upload */}
                    <div className="mb-4">
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition-colors hover:border-primary hover:bg-slate-100 dark:border-navy-500 dark:bg-navy-600 dark:hover:border-accent">
                            <svg className="mb-2 h-12 w-12 text-slate-400 dark:text-navy-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm text-slate-500 dark:text-navy-300">
                                Klik untuk upload gambar surat jalan
                            </span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>
                    </div>

                    {/* Preview */}
                    {preview && (
                        <div className="mb-4">
                            <img
                                src={preview}
                                alt="Preview"
                                className="max-h-64 w-full rounded-lg object-contain"
                            />
                        </div>
                    )}

                    {/* Process Button */}
                    <button
                        onClick={processOCR}
                        disabled={!file || loading}
                        className="btn w-full bg-primary text-white hover:bg-primary-focus disabled:opacity-50 dark:bg-accent dark:hover:bg-accent-focus"
                    >
                        {loading ? (
                            <span className="flex items-center justify-center">
                                <svg className="mr-2 h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Memproses... {progress}%
                            </span>
                        ) : (
                            <>
                                <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                </svg>
                                Proses OCR
                            </>
                        )}
                    </button>

                    {/* Raw Text */}
                    {extractedText && (
                        <div className="mt-4">
                            <h4 className="mb-2 text-sm font-medium text-slate-600 dark:text-navy-200">
                                Teks Hasil Ekstraksi:
                            </h4>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-xs text-slate-600 dark:bg-navy-600 dark:text-navy-200">
                                {extractedText}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Verification Section */}
                <div className="card p-6">
                    <h3 className="mb-4 text-lg font-medium text-slate-700 dark:text-navy-100">
                        Konfirmasi Data Barang
                    </h3>

                    {extractedItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <svg className="h-16 w-16 text-slate-300 dark:text-navy-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <p className="mt-4 text-sm text-slate-400 dark:text-navy-300">
                                Upload dan proses surat jalan untuk melihat hasil ekstraksi
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-3">
                                {extractedItems.map((item, index) => (
                                    <div
                                        key={index}
                                        className={`rounded-lg border p-4 ${item.confirmed
                                                ? 'border-success bg-success/5'
                                                : 'border-slate-200 dark:border-navy-500'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div className="flex-1 space-y-2">
                                                <div>
                                                    <label className="text-xs text-slate-500 dark:text-navy-300">Nama Barang</label>
                                                    <select
                                                        value={item.item_id || ''}
                                                        onChange={(e) => {
                                                            updateExtractedItem(index, 'item_id', e.target.value);
                                                            const selectedItem = items.find(i => i.id === e.target.value);
                                                            if (selectedItem) {
                                                                updateExtractedItem(index, 'name', selectedItem.name);
                                                            }
                                                        }}
                                                        className="form-select mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-navy-450"
                                                    >
                                                        <option value="">-- Pilih Barang --</option>
                                                        {items.map((i) => (
                                                            <option key={i.id} value={i.id}>
                                                                {i.name} ({i.sku})
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs text-slate-500 dark:text-navy-300">Jumlah</label>
                                                    <input
                                                        type="number"
                                                        value={item.quantity}
                                                        onChange={(e) => updateExtractedItem(index, 'quantity', parseInt(e.target.value) || 0)}
                                                        className="form-input mt-1 w-full rounded border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-navy-450"
                                                    />
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => confirmItem(index)}
                                                disabled={!item.item_id || item.confirmed}
                                                className={`btn h-10 px-3 ${item.confirmed
                                                        ? 'bg-success text-white'
                                                        : 'border border-success text-success hover:bg-success hover:text-white disabled:opacity-50'
                                                    }`}
                                            >
                                                {item.confirmed ? '✓' : 'OK'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Submit Button */}
                            <button
                                onClick={handleSubmitVerification}
                                disabled={processing || extractedItems.filter(i => i.confirmed).length === 0}
                                className="btn mt-4 w-full bg-success text-white hover:bg-success-focus disabled:opacity-50"
                            >
                                {processing ? 'Memproses...' : 'Simpan & Update Stok'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

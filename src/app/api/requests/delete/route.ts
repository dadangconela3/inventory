import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { requestId, returnStock } = body;

        if (!requestId) {
            return NextResponse.json(
                { error: 'Request ID harus diisi' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Konfigurasi server Supabase tidak lengkap' },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);

        // Verify that the caller is HRGA
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (token) {
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
            if (authError || !user) {
                return NextResponse.json(
                    { error: 'Sesi login tidak valid' },
                    { status: 401 }
                );
            }

            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profile?.role !== 'hrga') {
                return NextResponse.json(
                    { error: 'Hanya role HRGA yang berhak menghapus request' },
                    { status: 403 }
                );
            }
        }

        // Fetch the request and its items
        const { data: reqData, error: fetchErr } = await supabaseAdmin
            .from('requests')
            .select(`
                id,
                doc_number,
                items:request_items(
                    id,
                    item_id,
                    quantity,
                    item:items(id, name, current_stock, unit)
                )
            `)
            .eq('id', requestId)
            .single();

        if (fetchErr || !reqData) {
            return NextResponse.json(
                { error: 'Data request tidak ditemukan' },
                { status: 404 }
            );
        }

        // If returnStock is true, add quantities back to items stock
        if (returnStock && reqData.items && reqData.items.length > 0) {
            for (const reqItem of reqData.items) {
                const itemId = reqItem.item_id;
                const qtyToAdd = reqItem.quantity;

                if (itemId && qtyToAdd > 0) {
                    // Fetch current stock
                    const { data: itemData } = await supabaseAdmin
                        .from('items')
                        .select('current_stock')
                        .eq('id', itemId)
                        .single();

                    const currentStock = itemData?.current_stock ?? 0;
                    const newStock = currentStock + qtyToAdd;

                    const { error: updateErr } = await supabaseAdmin
                        .from('items')
                        .update({ current_stock: newStock })
                        .eq('id', itemId);

                    if (updateErr) {
                        console.error('Error returning stock for item', itemId, updateErr);
                    }
                }
            }
        }

        // Delete request_items first
        await supabaseAdmin
            .from('request_items')
            .delete()
            .eq('request_id', requestId);

        // Delete request
        const { error: deleteErr } = await supabaseAdmin
            .from('requests')
            .delete()
            .eq('id', requestId);

        if (deleteErr) {
            console.error('Error deleting request:', deleteErr);
            return NextResponse.json(
                { error: `Gagal menghapus request: ${deleteErr.message}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: `Request ${reqData.doc_number} berhasil dihapus${returnStock ? ' dan stok berhasil dikembalikan' : ''}.`
        });
    } catch (err: any) {
        console.error('Delete request error:', err);
        return NextResponse.json(
            { error: err.message || 'Terjadi kesalahan pada server' },
            { status: 500 }
        );
    }
}

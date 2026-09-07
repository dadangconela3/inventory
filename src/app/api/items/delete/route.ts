import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { itemIds, cascade = false } = body as { itemIds: string[]; cascade?: boolean };

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return NextResponse.json(
                { error: 'ID barang tidak valid atau kosong' },
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

        // Verify HRGA authorization
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
                    { error: 'Hanya role HRGA yang dapat menghapus barang' },
                    { status: 403 }
                );
            }
        }

        // Check references in request_items and incoming_stock_items
        const { data: reqItems } = await supabaseAdmin
            .from('request_items')
            .select('id, request_id, item_id')
            .in('item_id', itemIds);

        const { data: incItems } = await supabaseAdmin
            .from('incoming_stock_items')
            .select('id, incoming_stock_id, item_id')
            .in('item_id', itemIds);

        const totalReferences = (reqItems?.length || 0) + (incItems?.length || 0);

        if (totalReferences > 0 && !cascade) {
            return NextResponse.json({
                hasReferences: true,
                referenceCount: totalReferences,
                requestItemCount: reqItems?.length || 0,
                incomingItemCount: incItems?.length || 0,
                message: `Barang ini memiliki ${totalReferences} riwayat transaksi terkait (permintaan/stok masuk).`
            });
        }

        // If cascade is true or no references exist, delete referencing records first
        if (reqItems && reqItems.length > 0) {
            const { error: delReqItemsErr } = await supabaseAdmin
                .from('request_items')
                .delete()
                .in('item_id', itemIds);

            if (delReqItemsErr) throw delReqItemsErr;
        }

        if (incItems && incItems.length > 0) {
            const { error: delIncItemsErr } = await supabaseAdmin
                .from('incoming_stock_items')
                .delete()
                .in('item_id', itemIds);

            if (delIncItemsErr) throw delIncItemsErr;
        }

        const { error: delItemsErr } = await supabaseAdmin
            .from('items')
            .delete()
            .in('id', itemIds);

        if (delItemsErr) throw delItemsErr;

        return NextResponse.json({
            success: true,
            message: `${itemIds.length} barang berhasil dihapus.`
        });
    } catch (error: any) {
        console.error('Error in /api/items/delete:', error);
        return NextResponse.json(
            { error: error?.message || 'Gagal menghapus barang' },
            { status: 500 }
        );
    }
}

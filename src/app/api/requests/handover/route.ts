import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export interface HandoverItemInput {
    requestItemId?: string;
    itemId: string;
    actualQuantity: number;
}

export interface HandoverRequestInput {
    requestId: string;
    items: HandoverItemInput[];
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { handovers } = body as { handovers: HandoverRequestInput[] };

        if (!handovers || !Array.isArray(handovers) || handovers.length === 0) {
            return NextResponse.json(
                { error: 'Data serah terima tidak valid atau kosong' },
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
                    { error: 'Hanya role HRGA yang dapat melakukan serah terima barang' },
                    { status: 403 }
                );
            }
        }

        // Validate quantities and aggregate item requirements
        const totalDeductions: Record<string, number> = {};
        for (const handover of handovers) {
            if (!handover.requestId || !Array.isArray(handover.items) || handover.items.length === 0) {
                return NextResponse.json(
                    { error: 'Format request atau item tidak valid' },
                    { status: 400 }
                );
            }
            for (const item of handover.items) {
                if (!item.itemId || typeof item.actualQuantity !== 'number' || item.actualQuantity <= 0) {
                    return NextResponse.json(
                        { error: 'Jumlah serah terima tiap item minimal 1' },
                        { status: 400 }
                    );
                }
                totalDeductions[item.itemId] = (totalDeductions[item.itemId] || 0) + item.actualQuantity;
            }
        }

        // Fetch current stock from items table using supabaseAdmin
        const itemIds = Object.keys(totalDeductions);
        const { data: currentItems, error: itemsError } = await supabaseAdmin
            .from('items')
            .select('id, name, unit, current_stock')
            .in('id', itemIds);

        if (itemsError) throw itemsError;

        const currentItemsMap = new Map((currentItems || []).map(i => [i.id, i]));

        // Check if sufficient stock is available
        for (const itemId of itemIds) {
            const itemData = currentItemsMap.get(itemId);
            const totalRequired = totalDeductions[itemId];
            if (!itemData) {
                return NextResponse.json(
                    { error: `Item dengan ID ${itemId} tidak ditemukan di gudang` },
                    { status: 400 }
                );
            }
            if (itemData.current_stock < totalRequired) {
                return NextResponse.json(
                    {
                        error: `Stok tidak mencukupi untuk "${itemData.name}". Tersedia: ${itemData.current_stock} ${itemData.unit || 'pcs'}, Dibutuhkan: ${totalRequired} ${itemData.unit || 'pcs'}`
                    },
                    { status: 400 }
                );
            }
        }

        // Execute updates:
        // 1. Update request_items quantity to actualQuantity
        for (const handover of handovers) {
            for (const item of handover.items) {
                let query = supabaseAdmin
                    .from('request_items')
                    .update({ quantity: item.actualQuantity });

                if (item.requestItemId) {
                    query = query.eq('id', item.requestItemId);
                } else {
                    query = query.eq('request_id', handover.requestId).eq('item_id', item.itemId);
                }

                const { error: reqItemError } = await query;
                if (reqItemError) {
                    console.error('Error updating request_item:', reqItemError);
                    throw reqItemError;
                }
            }
        }

        // 2. Deduct current_stock in items
        for (const itemId of itemIds) {
            const itemData = currentItemsMap.get(itemId)!;
            const newStock = itemData.current_stock - totalDeductions[itemId];
            const { error: stockError } = await supabaseAdmin
                .from('items')
                .update({ current_stock: newStock })
                .eq('id', itemId);

            if (stockError) {
                console.error('Error updating stock:', stockError);
                throw stockError;
            }
        }

        // 3. Update request status to completed
        const requestIds = handovers.map(h => h.requestId);
        const { error: reqStatusError } = await supabaseAdmin
            .from('requests')
            .update({
                status: 'completed',
                updated_at: new Date().toISOString()
            })
            .in('id', requestIds);

        if (reqStatusError) {
            console.error('Error updating requests status:', reqStatusError);
            throw reqStatusError;
        }

        // 4. Fetch request details to send notifications
        const { data: completedRequests } = await supabaseAdmin
            .from('requests')
            .select('id, doc_number, requester_id')
            .in('id', requestIds);

        if (completedRequests && completedRequests.length > 0) {
            const notifications = completedRequests.map(r => ({
                user_id: r.requester_id,
                message: `Barang untuk request ${r.doc_number} telah diserahkan`,
                link: `/dashboard/requests/${r.id}`
            }));
            await supabaseAdmin.from('notifications').insert(notifications);

            // Send push notification
            try {
                const { sendPushNotification } = await import('@/lib/notifications');
                for (const r of completedRequests) {
                    await sendPushNotification({
                        title: '📦 Barang Siap Diambil',
                        body: `Barang untuk request ${r.doc_number} telah diserahkan`,
                        link: `/dashboard/requests/${r.id}`,
                        userId: r.requester_id
                    });
                }
            } catch (pushErr) {
                console.warn('Failed to send push notification:', pushErr);
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Serah terima barang berhasil diproses dan kuantitas disesuaikan'
        });
    } catch (error: any) {
        console.error('Error in /api/requests/handover:', error);
        return NextResponse.json(
            { error: error?.message || 'Terjadi kesalahan pada server saat memproses serah terima' },
            { status: 500 }
        );
    }
}

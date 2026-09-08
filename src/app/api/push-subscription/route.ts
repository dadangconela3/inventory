import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Helper to get Supabase admin client
function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables');
    }
    
    return createClient(supabaseUrl, supabaseServiceKey);
}

export async function POST(request: NextRequest) {
    try {
        const { subscription, userId } = await request.json();

        if (!subscription || !userId) {
            return NextResponse.json(
                { error: 'Missing subscription or userId' },
                { status: 400 }
            );
        }

        // Save or update subscription in database
        const supabaseAdmin = getSupabaseAdmin();

        // Check if this endpoint is already registered for this or another user
        const { data: existing } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('endpoint', subscription.endpoint)
            .maybeSingle();

        let resultData;
        if (existing) {
            // Update the existing record with current user_id and keys
            const { data, error } = await supabaseAdmin
                .from('push_subscriptions')
                .update({
                    user_id: userId,
                    p256dh: subscription.keys?.p256dh || existing.p256dh,
                    auth: subscription.keys?.auth || existing.auth,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
                .select()
                .single();

            if (error) {
                console.error('Error updating subscription:', error);
                return NextResponse.json(
                    { error: 'Failed to update subscription', details: error.message },
                    { status: 500 }
                );
            }
            resultData = data;
        } else {
            // Insert new record
            const { data, error } = await supabaseAdmin
                .from('push_subscriptions')
                .insert({
                    user_id: userId,
                    endpoint: subscription.endpoint,
                    p256dh: subscription.keys?.p256dh || '',
                    auth: subscription.keys?.auth || '',
                })
                .select()
                .single();

            if (error) {
                console.error('Error saving subscription:', error);
                return NextResponse.json(
                    { error: 'Failed to save subscription', details: error.message },
                    { status: 500 }
                );
            }
            resultData = data;
        }

        return NextResponse.json({ success: true, data: resultData });
    } catch (error) {
        console.error('Error in push subscription endpoint:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { endpoint, userId } = await request.json();

        if (!endpoint || !userId) {
            return NextResponse.json(
                { error: 'Missing endpoint or userId' },
                { status: 400 }
            );
        }

        // Delete subscription from database
        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('user_id', userId)
            .eq('endpoint', endpoint);

        if (error) {
            console.error('Error deleting subscription:', error);
            return NextResponse.json(
                { error: 'Failed to delete subscription' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in push subscription delete endpoint:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

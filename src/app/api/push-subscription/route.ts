import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Create Supabase client with service role for admin operations
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: NextRequest) {
    try {
        const { subscription, userId } = await request.json();

        if (!subscription || !userId) {
            return NextResponse.json(
                { error: 'Missing subscription or userId' },
                { status: 400 }
            );
        }

        // Save subscription to database
        const { data, error } = await supabaseAdmin
            .from('push_subscriptions')
            .upsert({
                user_id: userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
            }, {
                onConflict: 'user_id,endpoint'
            })
            .select()
            .single();

        if (error) {
            console.error('Error saving subscription:', error);
            return NextResponse.json(
                { error: 'Failed to save subscription' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true, data });
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

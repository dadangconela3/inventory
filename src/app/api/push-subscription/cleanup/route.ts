import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Cleanup endpoint for push subscriptions
 * Removes subscription from database by endpoint (no user_id required)
 * Used when user logs out or unsubscribes
 */
export async function POST(request: NextRequest) {
    try {
        const { endpoint } = await request.json();

        if (!endpoint) {
            return NextResponse.json(
                { error: 'Missing endpoint' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json(
                { error: 'Supabase configuration missing' },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Delete subscription by endpoint (regardless of user_id)
        const { error } = await supabaseAdmin
            .from('push_subscriptions')
            .delete()
            .eq('endpoint', endpoint);

        if (error) {
            console.error('[Subscription Cleanup] Error:', error);
            return NextResponse.json(
                { error: 'Failed to cleanup subscription' },
                { status: 500 }
            );
        }

        console.log('[Subscription Cleanup] Successfully removed subscription for endpoint:', endpoint);
        return NextResponse.json({ 
            success: true,
            message: 'Subscription cleaned up successfully'
        });

    } catch (error) {
        console.error('[Subscription Cleanup] Error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

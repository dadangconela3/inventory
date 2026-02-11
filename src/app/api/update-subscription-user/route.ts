import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const { subscription, userId } = await request.json();

        if (!subscription || !userId) {
            return NextResponse.json(
                { error: 'Missing subscription or userId' },
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

        // Find existing subscription by endpoint
        const { data: existing } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('endpoint', subscription.endpoint)
            .single();

        if (existing) {
            // Update user_id if different
            if (existing.user_id !== userId) {
                console.log(`[Subscription] Updating user_id from ${existing.user_id} to ${userId} for endpoint ${subscription.endpoint}`);
                
                const { error: updateError } = await supabaseAdmin
                    .from('push_subscriptions')
                    .update({ 
                        user_id: userId,
                        updated_at: new Date().toISOString()
                    })
                    .eq('endpoint', subscription.endpoint);

                if (updateError) {
                    console.error('[Subscription] Update error:', updateError);
                    return NextResponse.json(
                        { error: 'Failed to update subscription' },
                        { status: 500 }
                    );
                }

                return NextResponse.json({ 
                    success: true, 
                    updated: true,
                    message: 'Subscription user_id updated'
                });
            }

            return NextResponse.json({ 
                success: true, 
                updated: false,
                message: 'Subscription already up to date'
            });
        }

        // If no existing subscription, this shouldn't happen (user should subscribe first)
        return NextResponse.json({ 
            success: false, 
            error: 'No subscription found for this device'
        }, { status: 404 });

    } catch (error) {
        console.error('[Subscription] Update error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

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
            .maybeSingle();

        if (existing) {
            // Update user_id if different
            if (existing.user_id !== userId) {
                console.log(`[Subscription] Updating user_id from ${existing.user_id} to ${userId} for endpoint ${subscription.endpoint}`);
                
                const { error: updateError } = await supabaseAdmin
                    .from('push_subscriptions')
                    .update({ 
                        user_id: userId,
                        p256dh: subscription.keys?.p256dh || existing.p256dh,
                        auth: subscription.keys?.auth || existing.auth,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', existing.id);

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

        // If no existing subscription in DB, insert it
        const { error: insertError } = await supabaseAdmin
            .from('push_subscriptions')
            .insert({
                user_id: userId,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys?.p256dh || '',
                auth: subscription.keys?.auth || '',
            });

        if (insertError) {
            console.error('[Subscription] Insert fallback error:', insertError);
            return NextResponse.json(
                { error: 'Failed to save subscription' },
                { status: 500 }
            );
        }

        return NextResponse.json({ 
            success: true, 
            updated: true,
            message: 'Subscription registered'
        });

    } catch (error) {
        console.error('[Subscription] Update error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

interface PushNotificationPayload {
    userId: string;
    title: string;
    body: string;
    link?: string;
    icon?: string;
}

export async function POST(request: NextRequest) {
    try {
        const payload: PushNotificationPayload = await request.json();
        const { userId, title, body, link, icon } = payload;

        if (!userId || !title || !body) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, title, body' },
                { status: 400 }
            );
        }

        // Initialize Supabase
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing env vars:', { 
                hasUrl: !!supabaseUrl, 
                hasKey: !!supabaseServiceKey 
            });
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        console.log('Supabase URL:', supabaseUrl);
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch user's push subscriptions
        console.log('Fetching subscriptions for user:', userId);
        let subscriptions;
        try {
            const result = await supabaseAdmin
                .from('push_subscriptions')
                .select('*')
                .eq('user_id', userId);
            
            if (result.error) {
                console.error('Supabase query error:', result.error);
                return NextResponse.json(
                    { error: 'Failed to fetch subscriptions', details: result.error.message },
                    { status: 500 }
                );
            }
            subscriptions = result.data;
        } catch (fetchError) {
            console.error('Network error fetching subscriptions:', fetchError);
            return NextResponse.json(
                { error: 'Network error connecting to database', details: String(fetchError) },
                { status: 500 }
            );
        }

        console.log('Found subscriptions:', subscriptions?.length);

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json({
                success: true,
                sent: 0,
                total: 0,
                message: 'No subscriptions found for user',
            });
        }

        // Configure web push
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
        
        if (!vapidPublicKey || !vapidPrivateKey) {
            return NextResponse.json(
                { error: 'VAPID keys not configured' },
                { status: 500 }
            );
        }
        
        webpush.setVapidDetails(
            'mailto:admin@sakaeriken.com',
            vapidPublicKey,
            vapidPrivateKey
        );

        // Prepare notification payload
        const notificationPayload = JSON.stringify({
            title,
            body,
            icon: icon || '/icons/icon-192x192.png',
            badge: '/icons/icon-96x96.png',
            data: {
                url: link || '/dashboard',
            },
        });

        // Send push notification to all user's subscriptions
        const results = [];
        for (const sub of subscriptions) {
            try {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                };

                await webpush.sendNotification(pushSubscription, notificationPayload);
                results.push({ success: true, endpoint: sub.endpoint });
                console.log('Notification sent to:', sub.endpoint.substring(0, 50) + '...');
            } catch (sendError: unknown) {
                const err = sendError as { statusCode?: number; message?: string };
                console.error('Error sending to subscription:', err);
                
                // If subscription is invalid/expired, delete it
                if (err.statusCode === 410 || err.statusCode === 404) {
                    await supabaseAdmin
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', sub.id);
                    console.log('Deleted expired subscription:', sub.id);
                }
                
                results.push({ success: false, endpoint: sub.endpoint, error: err.message });
            }
        }

        const successCount = results.filter(r => r.success).length;

        return NextResponse.json({
            success: true,
            sent: successCount,
            total: subscriptions.length,
            results,
        });
    } catch (error) {
        console.error('Error in send notification endpoint:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: String(error) },
            { status: 500 }
        );
    }
}

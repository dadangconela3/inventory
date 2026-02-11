import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

// Helper to get Supabase admin client
function getSupabaseAdmin() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase environment variables');
    }
    
    return createClient(supabaseUrl, supabaseServiceKey);
}

// Helper to configure web push
function configureWebPush() {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    
    if (!vapidPublicKey || !vapidPrivateKey) {
        throw new Error('Missing VAPID keys');
    }
    
    webpush.setVapidDetails(
        'mailto:admin@sakaeriken.com',
        vapidPublicKey,
        vapidPrivateKey
    );
}

interface PushNotificationPayload {
    userId: string;
    title: string;
    body: string;
    link?: string;
    icon?: string;
}

export async function POST(request: NextRequest) {
    try {
        // Initialize Supabase and web push
        const supabaseAdmin = getSupabaseAdmin();
        configureWebPush();
        
        const payload: PushNotificationPayload = await request.json();
        const { userId, title, body, link, icon } = payload;

        if (!userId || !title || !body) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, title, body' },
                { status: 400 }
            );
        }

        // Fetch user's push subscriptions
        const { data: subscriptions, error } = await supabaseAdmin
            .from('push_subscriptions')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error('Error fetching subscriptions:', error);
            return NextResponse.json(
                { error: 'Failed to fetch subscriptions' },
                { status: 500 }
            );
        }

        if (!subscriptions || subscriptions.length === 0) {
            return NextResponse.json(
                { message: 'No subscriptions found for user' },
                { status: 200 }
            );
        }

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
        const sendPromises = subscriptions.map(async (sub) => {
            try {
                const pushSubscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: sub.p256dh,
                        auth: sub.auth,
                    },
                };

                await webpush.sendNotification(pushSubscription, notificationPayload);
                return { success: true, endpoint: sub.endpoint };
            } catch (error: any) {
                console.error('Error sending to subscription:', error);
                
                // If subscription is invalid/expired, delete it
                if (error.statusCode === 410 || error.statusCode === 404) {
                    await supabaseAdmin
                        .from('push_subscriptions')
                        .delete()
                        .eq('id', sub.id);
                }
                
                return { success: false, endpoint: sub.endpoint, error: error.message };
            }
        });

        const results = await Promise.all(sendPromises);
        const successCount = results.filter(r => r.success).length;

        return NextResponse.json({
            success: true,
            sent: successCount,
            total: subscriptions.length,
            results,
        });
    } catch (error: any) {
        console.error('Error in send notification endpoint:', error);
        
        // Return more specific error messages
        let errorMessage = 'Internal server error';
        if (error.message?.includes('Missing Supabase')) {
            errorMessage = 'Supabase configuration error. Check environment variables.';
        } else if (error.message?.includes('Missing VAPID')) {
            errorMessage = 'VAPID keys not configured. Check environment variables.';
        }
        
        return NextResponse.json(
            { error: errorMessage, details: error.message },
            { status: 500 }
        );
    }
}

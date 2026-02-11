/**
 * Push Notification Helper
 * Sends push notifications to users based on user IDs or roles
 */

interface SendNotificationParams {
    title: string;
    body: string;
    link: string;
    icon?: string;
    userId?: string; // For broadcast mode, this is just for logging
}

/**
 * Send push notification (broadcast to all devices)
 * In broadcast mode, all subscribed devices receive the notification
 */
export async function sendPushNotification({
    title,
    body,
    link,
    icon = '/icons/icon-192x192.png',
    userId = 'system',
}: SendNotificationParams): Promise<void> {
    try {
        console.log(`[Notification] Sending: "${title}" for user ${userId}`);
        
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId, // Not used in broadcast mode, but kept for logging
                title,
                body,
                link,
                icon,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('[Notification] Failed to send:', error);
            // Don't throw - notifications should not block main workflow
            return;
        }

        const result = await response.json();
        console.log(`[Notification] Sent successfully: ${result.sent}/${result.total} devices`);
    } catch (error) {
        console.error('[Notification] Error sending notification:', error);
        // Don't throw - notifications should not block main workflow
    }
}

'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        const registerSW = async () => {
            try {
                const existingReg = await navigator.serviceWorker.getRegistration();
                
                // If sw-custom.js is already registered, skip
                if (existingReg?.active?.scriptURL.includes('sw-custom.js')) {
                    console.log('[SW] Custom service worker already active');
                    return;
                }

                // Unregister any existing non-custom SW
                if (existingReg) {
                    console.log('[SW] Unregistering old service worker:', existingReg.active?.scriptURL);
                    await existingReg.unregister();
                }

                // Register our custom SW with push handlers
                console.log('[SW] Registering sw-custom.js...');
                const reg = await navigator.serviceWorker.register('/sw-custom.js');
                console.log('[SW] Custom service worker registered, scope:', reg.scope);
            } catch (error) {
                console.error('[SW] Registration failed:', error);
            }
        };

        registerSW();
    }, []);

    return null;
}

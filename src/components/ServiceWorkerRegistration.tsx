'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('serviceWorker' in navigator)) return;

        const registerSW = async () => {
            try {
                const existingReg = await navigator.serviceWorker.getRegistration();
                const scriptUrl = existingReg?.active?.scriptURL || existingReg?.installing?.scriptURL || existingReg?.waiting?.scriptURL || '';
                
                // If sw-custom.js is already registered (active, installing, or waiting), keep it
                if (scriptUrl.includes('sw-custom.js')) {
                    console.log('[SW] Custom service worker already registered');
                    return;
                }

                // Unregister any existing non-custom SW
                if (existingReg) {
                    console.log('[SW] Unregistering old service worker:', scriptUrl);
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

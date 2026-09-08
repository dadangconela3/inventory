import { toast } from 'sonner';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export const showColoredToast = (
    type: ToastType | string,
    message: string,
    options?: { description?: string; duration?: number; timer?: number; [key: string]: any }
) => {
    const duration = options?.duration || options?.timer || 3500;
    const description = options?.description;

    switch (type) {
        case 'success':
            return toast.success(message, { description, duration });
        case 'error':
            return toast.error(message, { description, duration });
        case 'warning':
            return toast.warning(message, { description, duration });
        case 'info':
            return toast.info(message, { description, duration });
        default:
            return toast(message, { description, duration });
    }
};

export { toast };
export default showColoredToast;

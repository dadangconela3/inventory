import Swal, { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

export const showColoredToast = async (
    icon: SweetAlertIcon,
    title: string,
    options?: SweetAlertOptions
) => {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-right',
        iconColor: 'white',
        customClass: {
            popup: 'colored-toast',
        },
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        ...options,
    });

    return await Toast.fire({
        icon,
        title,
    });
};

export default showColoredToast;

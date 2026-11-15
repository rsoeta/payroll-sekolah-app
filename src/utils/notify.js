import { toast } from 'react-toastify';

/**
 * Global Modular Notification Wrapper (React Toastify)
 * Optimized for Mobile-First touch screens (compact size, 2000ms autoClose).
 * Replaces native browser `alert()` calls across the entire application.
 */
const DEFAULT_TOAST_OPTIONS = {
  position: 'top-center',
  autoClose: 2000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: false,
  pauseOnFocusLoss: false,
  draggable: true,
  theme: 'colored',
};

export const notify = {
  success(message, customOptions = {}) {
    return toast.success(message, { ...DEFAULT_TOAST_OPTIONS, ...customOptions });
  },
  error(message, customOptions = {}) {
    return toast.error(message, {
      ...DEFAULT_TOAST_OPTIONS,
      autoClose: 2800,
      ...customOptions,
    });
  },
  info(message, customOptions = {}) {
    return toast.info(message, { ...DEFAULT_TOAST_OPTIONS, ...customOptions });
  },
  warn(message, customOptions = {}) {
    return toast.warning(message, { ...DEFAULT_TOAST_OPTIONS, ...customOptions });
  },
};

export default notify;

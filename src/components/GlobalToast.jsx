import React from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/**
 * GlobalToast Component
 * Mount once at the root of the React tree (`App.jsx`) to render compact,
 * touch-friendly notifications styled with the Outfit typeface.
 */
export function GlobalToast() {
  return (
    <ToastContainer
      position="top-center"
      autoClose={2000}
      limit={3}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss={false}
      draggable
      pauseOnHover={false}
      theme="colored"
    />
  );
}

export default GlobalToast;

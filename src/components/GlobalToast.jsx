import React from 'react';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

/**
 * GlobalToast Component
 * Mount once at the root of the React tree (`App.jsx`) to render compact,
 * frosted glass notifications matching the dark/light theme.
 */
export function GlobalToast() {
  return (
    <ToastContainer
      position="top-center"
      autoClose={2200}
      limit={3}
      newestOnTop
      closeOnClick
      rtl={false}
      pauseOnFocusLoss={false}
      draggable
      pauseOnHover={false}
    />
  );
}

export default GlobalToast;

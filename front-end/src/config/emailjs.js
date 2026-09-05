// EmailJS credentials, derived from environment variables.
// Source of truth is server/.env, copied to front-end/.env.local by
// scripts/sync-env.js on predev/prebuild. Never hardcode these values.

export const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
export const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

// Sign-up notification template.
export const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

// Template used to send account credentials to a newly approved user.
export const EMAILJS_CREDENTIALS_TEMPLATE_ID = import.meta.env
  .VITE_EMAILJS_CREDENTIALS_TEMPLATE_ID;

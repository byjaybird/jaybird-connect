export const API_URL = 'https://jaybird-connect.ue.r.appspot.com';

// Deployment time (set at build time via Vite env var VITE_DEPLOY_TIME)
// Example build command to embed a timestamp:
// VITE_DEPLOY_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) npm run build
export const DEPLOY_TIME = import.meta.env?.VITE_DEPLOY_TIME || new Date().toISOString();

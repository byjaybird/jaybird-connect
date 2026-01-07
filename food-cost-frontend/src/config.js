export const API_URL = 'https://jaybird-connect.ue.r.appspot.com';

// Deployment time (set at build time via Vite env var VITE_DEPLOY_TIME)
// Example build command to embed a timestamp:
// VITE_DEPLOY_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) npm run build
// DEPLOY_TIME is embedded at build time via VITE_DEPLOY_TIME. If it's not provided during build, we show 'unknown' so the UI doesn't mistakenly display the current load time.
// To embed the timestamp locally before building run:
// VITE_DEPLOY_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ) npm run build
export const DEPLOY_TIME = import.meta.env?.VITE_DEPLOY_TIME || '393';

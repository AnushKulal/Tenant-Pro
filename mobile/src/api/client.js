// File: mobile/src/api/client.js
import axios from 'axios';

// -----------------------------------------------------------------------------
// API CONNECTION
// -----------------------------------------------------------------------------
// The app talks to the backend at SERVER_URL. This value is read from the
// EXPO_PUBLIC_API_URL environment variable (see mobile/.env), so you can switch
// between local development and a hosted/production backend WITHOUT editing code.
//
//   • Local testing (phone on same WiFi as your laptop):
//       EXPO_PUBLIC_API_URL=http://<your-laptop-IPv4>:5000
//       (find your IPv4 with `ipconfig` on Windows or `ifconfig`/`ip a` on Mac/Linux)
//
//   • Downloadable APK / installed app (backend hosted on the internet):
//       EXPO_PUBLIC_API_URL=https://your-backend-host.com
//
// If the variable is not set, we fall back to the LAN IP below so nothing breaks.
// -----------------------------------------------------------------------------

// Fallback used only when EXPO_PUBLIC_API_URL is not defined. This MUST be the
// hosted backend (not a LAN IP): OTA updates don't always carry build-time env
// vars, and if the fallback were a local IP the installed app would point at a
// dead address and fail with "unable to connect". Defaulting to production is
// the safe choice — real devices can always reach it.
const FALLBACK_URL = 'https://tenantpro-backend.onrender.com';

export const SERVER_URL =
    process.env.EXPO_PUBLIC_API_URL || FALLBACK_URL;

// Kept for backwards compatibility (some screens import IP_ADDRESS).
export const IP_ADDRESS = '10.92.188.3';

// Resolve an image/file URL coming from the backend.
//   • Absolute URLs (Cloudinary: "https://...") are returned as-is.
//   • Relative paths (local disk: "/uploads/...") are prefixed with SERVER_URL.
// Use this everywhere instead of `${SERVER_URL}${path}` so both storage modes work.
export const mediaUrl = (p) => {
    if (!p) return null;
    return /^https?:\/\//i.test(p) ? p : `${SERVER_URL}${p}`;
};

const client = axios.create({
    baseURL: `${SERVER_URL}/api`,
    // Free hosting can take ~50s to "wake up" after inactivity. A generous
    // timeout lets that first request succeed instead of failing instantly.
    timeout: 60000,
    headers: {
        'Content-Type': 'application/json'
    }
});

export default client;

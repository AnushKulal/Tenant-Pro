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

// Fallback used only when EXPO_PUBLIC_API_URL is not defined. Replace with your IPv4.
const FALLBACK_IP = '10.92.188.3';

export const SERVER_URL =
    process.env.EXPO_PUBLIC_API_URL || `http://${FALLBACK_IP}:5000`;

// Kept for backwards compatibility (some screens import IP_ADDRESS).
export const IP_ADDRESS = FALLBACK_IP;

const client = axios.create({
    baseURL: `${SERVER_URL}/api`,
    headers: {
        'Content-Type': 'application/json'
    }
});

export default client;

// File: mobile/src/redesign/push.js
//
// Getting this device a push token, and handing it to the server.
//
// ── Why every single call here is guarded ──────────────────────────────────────
// `expo-notifications` is NATIVE code. It ships in the binary, not in the JS bundle,
// so an over-the-air update that references it lands on handsets where the module does
// not exist. Requiring it at the top of a file would take the whole app down on every
// build older than the one that added it — which right now is every build anybody has
// installed.
//
// So it is loaded exactly the way expo-camera is in ScanQrScreen: required inside a
// try, checked for the functions we actually call, and null if any of that fails.
// Everything below then degrades to doing nothing, which is the correct behaviour on a
// build that cannot receive a push anyway.

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// The module, or null on a build without it.
//
// Cached after the first attempt: the require throws on old binaries, and repeating a
// throwing require on every sign-in is pure waste.
let cached;
function loadNotifications() {
    if (cached !== undefined) return cached;
    try {
        const mod = require('expo-notifications');
        // Checked by capability rather than by presence. A partially-shimmed module is
        // worse than a missing one, because it fails halfway through instead of at the
        // door.
        if (!mod || typeof mod.getPermissionsAsync !== 'function'
            || typeof mod.requestPermissionsAsync !== 'function'
            || typeof mod.getExpoPushTokenAsync !== 'function') {
            cached = null;
            return cached;
        }
        cached = mod;
    } catch (e) {
        // The ordinary case on any build that predates this file. Not an error.
        cached = null;
    }
    return cached;
}

// Whether this build can receive notifications at all. Lets the UI say "not on this
// version" rather than showing a toggle that silently does nothing.
export const pushAvailable = () => loadNotifications() !== null;

// EAS puts the project id here; it is what tells Expo's push service which project a
// token belongs to, and getExpoPushTokenAsync refuses without it on a real build.
const projectId = () =>
    Constants?.expoConfig?.extra?.eas?.projectId
    || Constants?.easConfig?.projectId
    || null;

// Android delivers notifications through a channel, and one that does not exist means
// the notification arrives silently and at minimum importance — which looks, from the
// outside, exactly like it never arrived. Created before any token is asked for.
const ensureChannel = async (Notifications) => {
    if (Platform.OS !== 'android') return;
    try {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'TenantPro',
            importance: Notifications.AndroidImportance?.DEFAULT ?? 3,
            // Matches the app's accent so the status-bar dot is recognisably ours.
            lightColor: '#C8F751'
        });
    } catch (e) {
        // A channel that could not be created is not a reason to skip the token: the
        // notification still arrives, just quietly.
    }
};

// Ask for permission and return this device's Expo token, or null.
//
// Null covers every ordinary refusal — an old build, a simulator, a person who said no
// — and none of them is an error worth showing. Somebody who declined notifications
// declined them; telling them off about it is not the app's business.
export const getPushToken = async () => {
    const Notifications = loadNotifications();
    if (!Notifications) return null;

    try {
        await ensureChannel(Notifications);

        const existing = await Notifications.getPermissionsAsync();
        let status = existing?.status;
        // Only ASK if we have not been answered. Re-prompting somebody who already said
        // no does nothing on both platforms and is the reason apps feel nagging.
        if (status !== 'granted') {
            const asked = await Notifications.requestPermissionsAsync();
            status = asked?.status;
        }
        if (status !== 'granted') return null;

        const id = projectId();
        const res = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
        return res?.data || null;
    } catch (e) {
        // Simulators, missing Google Play services, a project id that does not match the
        // build. All of them mean "no token", none of them means "tell the user".
        return null;
    }
};

// What the app should do when a notification is tapped while it is closed or in the
// background. Returns an unsubscribe, or a no-op on a build without the module.
//
// The payload's `route` comes from the server — see backend/utils/pushRules — so the
// two ends cannot disagree about where a given kind lands.
export const onNotificationTap = (handler) => {
    const Notifications = loadNotifications();
    if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
        return () => {};
    }
    try {
        const sub = Notifications.addNotificationResponseReceivedListener((response) => {
            const data = response?.notification?.request?.content?.data || {};
            if (data.route) handler(data);
        });
        return () => { try { sub.remove(); } catch (e) { /* already gone */ } };
    } catch (e) {
        return () => {};
    }
};

// Show notifications that arrive while the app is OPEN, rather than swallowing them.
// Expo's default is to deliver them silently to the foreground, which means a landlord
// looking at one screen never learns something happened on another.
export const setForegroundBehaviour = () => {
    const Notifications = loadNotifications();
    if (!Notifications || typeof Notifications.setNotificationHandler !== 'function') return;
    try {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldShowAlert: true,
                shouldPlaySound: false,
                shouldSetBadge: false
            })
        });
    } catch (e) {
        /* older module shapes — the app works without this */
    }
};

export default { pushAvailable, getPushToken, onNotificationTap, setForegroundBehaviour };

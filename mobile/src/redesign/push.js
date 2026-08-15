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

// Ask for permission and resolve this device's Expo token.
//
// Returns { token, reason } — the token, or null with the reason it is null. The REASON
// is not for the ordinary path, which correctly says nothing: somebody who declined
// notifications declined them, and telling them off about it is not the app's business.
// It exists because "why did my test notification not arrive" has four completely
// different answers with completely different fixes, and without this the app cannot
// tell them apart:
//
//   unsupported  this binary has no notification module — an OTA cannot add one
//   denied       permission was refused, so the fix is in the system settings
//   nofcm        the build carries no Firebase config, so Android cannot register
//   failed       a simulator, no Play services, a project id that does not match
//   (none)       there is a token
export const resolvePushToken = async () => {
    const Notifications = loadNotifications();
    if (!Notifications) return { token: null, reason: 'unsupported' };

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
        if (status !== 'granted') return { token: null, reason: 'denied' };

        const id = projectId();
        const res = await Notifications.getExpoPushTokenAsync(id ? { projectId: id } : undefined);
        const token = res?.data || null;
        return token ? { token, reason: null } : { token: null, reason: 'failed' };
    } catch (e) {
        return { token: null, reason: classify(e) };
    }
};

// Android delivers push through Firebase Cloud Messaging, and a build with no
// google-services.json cannot register with it — getExpoPushTokenAsync throws rather
// than returning null. That is a BUILD configuration problem, and telling somebody to
// sign out and back in sends them round a loop that cannot possibly help.
//
// Matched on the message text, which is unavoidably fragile — Firebase's wording is not
// a contract. It degrades the right way though: anything unrecognised falls through to
// 'failed', which is exactly what this returned before, so a reworded error costs a
// better sentence rather than a working diagnosis.
const classify = (e) => {
    const msg = `${(e && e.message) || ''} ${(e && e.code) || ''}`;
    return /firebase|fcm|FIS_AUTH|SERVICE_NOT_AVAILABLE|MISSING_INSTANCEID/i.test(msg)
        ? 'nofcm'
        : 'failed';
};

// The token alone, or null. What every caller that is not a diagnostic wants.
export const getPushToken = async () => (await resolvePushToken()).token;

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

export default { pushAvailable, getPushToken, resolvePushToken, onNotificationTap, setForegroundBehaviour };

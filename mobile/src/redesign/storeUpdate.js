// File: mobile/src/redesign/storeUpdate.js
//
// Noticing a new BUILD — the kind the app cannot install itself.
//
// ── The two kinds of update, and why only one of them lives here ─────────────
//
// updates.js handles the OTA kind: new JavaScript for the build already on the
// phone. The app fetches it and restarts, and that covers most releases.
//
// This handles the other kind. When a release changes native code — a new
// permission, a new library, a version bump — the JavaScript bundle is no
// longer enough, and a new APK has to be installed through Android's package
// installer. The app cannot do that for you, so the whole feature is: notice,
// and say so, clearly, on every screen, until it is dealt with.
//
// It cannot even notice on its own. A phone running 1.4.0 has no way to learn
// that 1.5.0 exists — the update server only ever offers bundles built for its
// own runtime. So the app asks the backend, which is told by a single
// environment variable (see backend/controllers/appVersionController.js).
//
// ── Why the app does not do the comparing ────────────────────────────────────
//
// If the version comparison lived here and was wrong, the fix would have to
// reach phones through exactly the mechanism that is already broken. The server
// compares; this renders the verdict. Where no verdict can be had — offline,
// old server, nothing configured — it shows nothing, because silence is the
// right failure for a notice nobody asked for.
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { SERVER_URL } from './api';

const state = {
    checked: false,
    available: false,
    mandatory: false,
    latest: null,
    current: null,
    url: null,
    notes: [],
    // Dismissed for THIS run of the app only — see the note on dismiss().
    dismissed: false
};

const listeners = new Set();
const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); };

export const getStoreUpdate = () => state;

export function useStoreUpdate() {
    const [, bump] = useState(0);
    useEffect(() => {
        const fn = () => bump((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return state;
}

const myVersion = () => {
    try {
        const cfg = (Constants && Constants.expoConfig) || {};
        return String(cfg.version || '').trim();
    } catch (e) {
        return '';
    }
};

let inFlight = null;

/**
 * Ask the server whether a newer build exists.
 *
 * Never throws and never reports an error to the user: this is a notice they
 * did not ask for, so a failed check is simply a check that found nothing. The
 * "Check for updates" row in Settings is where a person asks on purpose, and it
 * reports the OTA side, which is the side that can actually be acted on.
 */
export async function checkStoreVersion() {
    if (inFlight) return inFlight;
    const current = myVersion();
    inFlight = (async () => {
        try {
            if (!current) return state;
            // Short timeout: this runs at launch alongside everything else the
            // app needs, and a slow answer to "is there a newer app" must never
            // be the thing holding up the first screen.
            const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const timer = ctrl ? setTimeout(() => ctrl.abort(), 6000) : null;
            const res = await fetch(
                `${SERVER_URL}/api/app/version?current=${encodeURIComponent(current)}`,
                ctrl ? { signal: ctrl.signal } : undefined
            );
            if (timer) clearTimeout(timer);
            if (!res.ok) return state;
            const j = await res.json();
            Object.assign(state, {
                checked: true,
                available: !!j.updateAvailable,
                mandatory: !!j.mandatory,
                latest: j.latest || null,
                current,
                url: j.url || null,
                notes: Array.isArray(j.notes) ? j.notes : []
            });
            emit();
        } catch (e) {
            // Offline, server down, or a backend too old to know this endpoint.
            // All of them mean "nothing to announce".
        } finally {
            inFlight = null;
        }
        return state;
    })();
    return inFlight;
}

/**
 * Hide the banner.
 *
 * For this run of the app only, deliberately. The thing being announced cannot
 * be done inside the app — it needs a trip to the store — so somebody
 * dismissing it has almost always postponed rather than declined. Forgetting on
 * next launch is how the notice stays useful without being a wall.
 *
 * A MANDATORY update cannot be dismissed at all. It still does not block the
 * screen: the app cannot install the thing either way, and locking somebody out
 * of their own rent screen over it would strand them rather than help.
 */
export function dismissStoreUpdate() {
    if (state.mandatory) return;
    state.dismissed = true;
    emit();
}

/** Whether the banner should be on screen right now. */
export const shouldShowStoreBanner = () =>
    state.available && !!state.url && (state.mandatory || !state.dismissed);

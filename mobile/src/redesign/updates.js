// File: mobile/src/redesign/updates.js
//
// One place that knows about updates, so two screens cannot disagree about one.
//
// ── Why this exists ──────────────────────────────────────────────────────────
//
// The app already had an update prompt: UpdateSheet checks on launch and
// whenever the app comes back to the foreground, and if something is waiting it
// slides up with the release notes and a button. That covers the common case
// and it is the right default — nobody should have to go looking.
//
// What it did not cover is the case somebody actually reported: the sheet was
// dismissed, and now there is no way to ask again. The check lived inside the
// component, so the only thing that could start one was that component
// mounting. Closing the sheet meant waiting for the next foreground.
//
// Putting the state here lets Settings ask too, and — the part that matters —
// means both surfaces are looking at the SAME check. A Settings row with its
// own copy of this would be a second opinion about whether an update exists,
// and the two would drift the first time one of them failed.
//
// ── What an "update" is here ─────────────────────────────────────────────────
//
// Two different things wear that word and only one of them is handled in the
// app:
//
//   · an OTA update — new JavaScript for the build already installed. The app
//     can fetch and apply this itself, which is what `install()` does. It takes
//     seconds and restarts the app.
//   · a new BUILD — new native code, a new APK. The app cannot install that
//     itself: Android requires the package installer and an app that sideloads
//     its own replacement is the behaviour every store rejects. All this can do
//     is notice, and say so.
//
// `runtimeVersion` is what tells them apart. An OTA only ever reaches builds on
// its own runtime, so if the server has nothing for this build, either there is
// nothing new or what is new needs a build this phone has not got. The app
// cannot tell those two apart from here — so it says "you are up to date",
// which is true of what it can see, and never invents a download it cannot do.
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

// Release notes travel inside the update manifest (expo.extra.releaseNotes),
// written by the publish workflow from the real commit subjects. EAS nests the
// app config under extra.expoClient on modern manifests and puts it at the top
// level on older ones, so accept both, and an array or a newline-joined string.
export function readNotes(manifest) {
    const m = manifest || {};
    const extra = (m.extra && m.extra.expoClient && m.extra.expoClient.extra) || m.extra || {};
    const raw = extra.releaseNotes != null ? extra.releaseNotes : extra.whatsNew;
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split('\n') : []);
    return list.map((l) => String(l).trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
}

// The notes baked into THIS build, so a sheet is never empty and so Settings can
// say what the version you are running contains.
export function localNotes() {
    const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
    const raw = extra.releaseNotes != null ? extra.releaseNotes : extra.whatsNew;
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split('\n') : []);
    return list.map((l) => String(l).trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
}

// Where updates are possible at all. False in development and in the web
// export, where there is no update machinery compiled in — and a screen that
// offered to download one there would be offering something that cannot happen.
export const updatesPossible = () => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) return false;
    try { return !!Updates.isEnabled; } catch (e) { return false; }
};

const DOWNLOAD_CEILING = 0.92;

// ── The store ────────────────────────────────────────────────────────────────
//
// Deliberately not React context: UpdateSheet renders outside the screen tree
// (it is held across every early return in RedesignRoot) and Settings renders
// inside it. A module-level store is reachable from both without either of them
// having to be a child of the other.
const state = {
    // 'idle' | 'checking' | 'available' | 'uptodate' | 'downloading'
    //       | 'installing' | 'restarting' | 'error' | 'unsupported'
    phase: 'idle',
    notes: [],
    progress: 0,
    error: '',
    // When the last check finished, so Settings can say "checked just now"
    // rather than leaving somebody wondering whether anything happened.
    checkedAt: null,
    // True only for a check somebody asked for. The automatic one on launch
    // stays quiet when there is nothing to report; a manual one must always say
    // something back, or the button looks broken.
    manual: false,
    // Whether the prompt should be on screen.
    visible: false
};

const listeners = new Set();
const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); };
const set = (patch) => { Object.assign(state, patch); emit(); };

export const getUpdateState = () => state;

export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

// A React view of the store. Both surfaces use this so neither keeps its own.
export function useUpdates() {
    const [, bump] = useState(0);
    useEffect(() => subscribe(() => bump((n) => n + 1)), []);
    return state;
}

let ticker = null;
const clearTicker = () => { if (ticker) { clearInterval(ticker); ticker = null; } };

const busy = () => ['downloading', 'installing', 'restarting'].includes(state.phase);

/**
 * Ask the update server whether there is anything new.
 * @param {object} opts
 * @param {boolean} opts.manual  true when a person pressed a button. A manual
 *   check reports "you are up to date" and reports failures; the automatic one
 *   stays silent on both, because an app that announces "no update" every time
 *   it is opened is an app people stop reading.
 */
export async function check({ manual = false } = {}) {
    if (busy()) return;                       // never interrupt a running install
    if (!updatesPossible()) {
        set({ phase: 'unsupported', manual, checkedAt: Date.now() });
        return;
    }
    set({ phase: 'checking', manual, error: '' });
    try {
        const res = await Updates.checkForUpdateAsync();
        if (res && res.isAvailable) {
            const fromManifest = readNotes(res.manifest);
            set({
                phase: 'available',
                notes: fromManifest.length ? fromManifest : localNotes(),
                progress: 0,
                error: '',
                checkedAt: Date.now(),
                // An update found by a manual check still opens the sheet: that
                // is the surface with the notes and the button on it.
                visible: true
            });
        } else {
            set({ phase: 'uptodate', notes: [], checkedAt: Date.now(), visible: false });
        }
    } catch (e) {
        // Offline, or the update server is unreachable. Said out loud only when
        // somebody asked — see the note on `manual` above.
        set({
            phase: 'error',
            checkedAt: Date.now(),
            error: e && e.message
                ? `Could not check for updates: ${e.message}`
                : 'Could not reach the update server. Check your connection and try again.'
        });
    }
}

/** Download the waiting update and restart into it. */
export async function install() {
    if (busy()) return;
    if (!updatesPossible()) { set({ phase: 'unsupported' }); return; }
    set({ phase: 'downloading', progress: 0.06, error: '' });
    clearTicker();
    // expo-updates exposes no byte-level progress, so the bar eases toward a
    // ceiling while the real download runs and only snaps to 100% once
    // fetchUpdateAsync actually resolves. It never claims to be finished first.
    ticker = setInterval(() => {
        set({ progress: state.progress >= DOWNLOAD_CEILING
            ? state.progress
            : state.progress + (DOWNLOAD_CEILING - state.progress) * 0.08 });
    }, 220);
    try {
        await Updates.fetchUpdateAsync();
        clearTicker();
        set({ progress: 1, phase: 'installing' });
        await new Promise((r) => setTimeout(r, 450));
        set({ phase: 'restarting' });
        await Updates.reloadAsync();          // the process restarts here
    } catch (e) {
        clearTicker();
        set({
            phase: 'error',
            progress: 0,
            error: e && e.message
                ? `Could not install the update: ${e.message}`
                : 'Could not install the update. Please try again.'
        });
    }
}

/** Close the prompt without installing. Settings is how you get it back. */
export function dismiss() {
    if (busy()) return;
    set({ visible: false, phase: state.phase === 'available' ? 'available' : 'idle' });
}

// ── What to say about it ─────────────────────────────────────────────────────
//
// One description, used by the Settings row, so the words cannot drift from the
// state that produced them.
export function describeUpdateState(s, build) {
    const b = build || {};
    switch (s.phase) {
        case 'checking':
            return { title: 'Checking for updates…', body: '', cta: '', busy: true };
        case 'available':
            return {
                title: 'An update is ready',
                body: s.notes.length
                    ? s.notes.slice(0, 4).join(' · ')
                    : 'Improvements and fixes. It takes a few seconds and the app restarts.',
                cta: 'Download and install',
                busy: false
            };
        case 'downloading':
            return { title: 'Downloading…', body: 'Keep the app open until it finishes.', cta: '', busy: true };
        case 'installing':
            return { title: 'Installing…', body: '', cta: '', busy: true };
        case 'restarting':
            return { title: 'Restarting TenantPro…', body: '', cta: '', busy: true };
        case 'uptodate':
            return {
                title: 'You are on the latest version',
                // Says what "latest" means here, because an OTA only reaches
                // builds on its own runtime — so "nothing waiting" is a claim
                // about this build, not about the app in general.
                body: `Version ${b.version || '—'}${b.updateShort ? ` · update ${b.updateShort}` : ''}. A new version with changed app code would need a new install from the store or a link.`,
                cta: 'Check again',
                busy: false
            };
        case 'error':
            return { title: 'Could not check', body: s.error, cta: 'Try again', busy: false };
        case 'unsupported':
            return {
                title: 'Updates are not available here',
                body: 'This build has no update machinery compiled in — that is normal in development and in the web preview.',
                cta: '',
                busy: false
            };
        default:
            return {
                title: 'Check for updates',
                body: `You are on version ${b.version || '—'}${b.updateShort ? ` · update ${b.updateShort}` : ''}.`,
                cta: 'Check now',
                busy: false
            };
    }
}

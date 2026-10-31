// File: mobile/src/redesign/UpdateSheet.js
// The redesign's over-the-air update prompt.
//
// v1 shows this via src/components/UpdateGate.js, but App.js returns
// RedesignRoot BEFORE reaching UpdateGate, so v2 had no update UI at all — an
// available update would sit there unannounced. This is the v2 equivalent:
// identical mechanics (manual checkForUpdateAsync on mount and whenever the app
// returns to the foreground, then fetch → reload), rendered in the redesign's
// own language instead of the glass kit.
//
// Progress note: expo-updates exposes no byte-level progress, so the bar eases
// asymptotically toward a ceiling while the real download runs and only snaps to
// 100% once fetchUpdateAsync() actually resolves — it never claims to be done
// before it is.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, AppState, Animated } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useT } from './ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Monogram } from './ui';

const PHASE_LABEL = {
    idle: '',
    downloading: 'Downloading update…',
    installing: 'Installing…',
    restarting: 'Restarting TenantPro…',
    error: 'Update failed'
};

const DOWNLOAD_CEILING = 0.92;

// Release notes travel inside the update manifest (expo.extra.releaseNotes).
// EAS nests the app config under extra.expoClient on modern manifests and puts
// it at the top level on older ones, so accept both, and an array or a
// newline-joined string.
function readNotes(manifest) {
    const m = manifest || {};
    const extra = (m.extra && m.extra.expoClient && m.extra.expoClient.extra) || m.extra || {};
    const raw = extra.releaseNotes != null ? extra.releaseNotes : extra.whatsNew;
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split('\n') : []);
    return list.map((l) => String(l).trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
}

// Fall back to the notes baked into this build so the sheet is never empty.
function localNotes() {
    const extra = (Constants.expoConfig && Constants.expoConfig.extra) || {};
    const raw = extra.releaseNotes != null ? extra.releaseNotes : extra.whatsNew;
    const list = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split('\n') : []);
    return list.map((l) => String(l).trim().replace(/^[-•*]\s*/, '')).filter(Boolean);
}

export default function UpdateSheet() {
    const t = useT();
    const [visible, setVisible] = useState(false);
    const [notes, setNotes] = useState([]);
    const [phase, setPhase] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [errorText, setErrorText] = useState('');

    const tickRef = useRef(null);
    const busy = phase === 'downloading' || phase === 'installing' || phase === 'restarting';
    const busyRef = useRef(busy);
    useEffect(() => { busyRef.current = busy; }, [busy]);

    const rise = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (visible) {
            Animated.timing(rise, { toValue: 1, duration: 260, useNativeDriver: true }).start();
        }
    }, [visible, rise]);

    const clearTick = useCallback(() => {
        if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    }, []);
    useEffect(() => clearTick, [clearTick]);

    const check = useCallback(async () => {
        // Only meaningful in a real build with updates compiled in — never in dev.
        if (__DEV__ || !Updates.isEnabled) return;
        if (busyRef.current) return; // don't interrupt a running install
        try {
            const res = await Updates.checkForUpdateAsync();
            if (res.isAvailable) {
                const fromManifest = readNotes(res.manifest);
                setNotes(fromManifest.length ? fromManifest : localNotes());
                setErrorText('');
                setPhase('idle');
                setProgress(0);
                setVisible(true);
            }
        } catch (e) {
            // Offline or the update server is unreachable — stay silent.
        }
    }, []);

    useEffect(() => {
        check();
        const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
        return () => sub.remove();
    }, [check]);

    const updateNow = async () => {
        setErrorText('');
        setPhase('downloading');
        setProgress(0.06);
        clearTick();
        tickRef.current = setInterval(() => {
            setProgress((p) => (p >= DOWNLOAD_CEILING ? p : p + (DOWNLOAD_CEILING - p) * 0.08));
        }, 220);
        try {
            await Updates.fetchUpdateAsync();
            clearTick();
            setProgress(1);
            setPhase('installing');
            await new Promise((r) => setTimeout(r, 450));
            setPhase('restarting');
            await Updates.reloadAsync();
        } catch (e) {
            clearTick();
            setPhase('error');
            setProgress(0);
            setErrorText(
                e && e.message
                    ? `Could not install the update: ${e.message}`
                    : 'Could not install the update. Please try again.'
            );
        }
    };

    if (!visible) return null;

    const translateY = rise.interpolate({ inputRange: [0, 1], outputRange: [240, 0] });

    return (
        <View
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 90, elevation: 30 }}
        >
            {/* scrim — not dismissible mid-install */}
            <Press
                onPress={busy ? undefined : () => setVisible(false)}
                disabled={busy}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,4,6,0.72)' }}
            />

            <Animated.View
                style={{
                    transform: [{ translateY }],
                    opacity: rise,
                    backgroundColor: t.ink2,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    borderTopWidth: 1,
                    borderColor: t.line2,
                    paddingTop: 22,
                    paddingHorizontal: 22,
                    paddingBottom: 30
                }}
            >
                <Row gap={13} style={{ marginBottom: 16 }}>
                    <Monogram size={40} />
                    <View style={{ flex: 1 }}>
                        <Eyebrow s={9} ls={0.14} c={t.accent}>NEW VERSION READY</Eyebrow>
                        <T w={700} s={20} lh={1.15} style={{ letterSpacing: -0.6, marginTop: 5 }}>Update TenantPro</T>
                    </View>
                </Row>

                {notes.length > 0 && phase === 'idle' ? (
                    <View style={{ backgroundColor: t.ink3, borderRadius: 18, borderWidth: 1, borderColor: t.line, padding: 15, marginBottom: 16, rowGap: 9 }}>
                        <Eyebrow s={9} ls={0.12} c={t.fg3}>WHAT’S NEW</Eyebrow>
                        {notes.slice(0, 5).map((n, i) => (
                            <Row key={i} gap={9} align="flex-start">
                                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.lime, marginTop: 6 }} />
                                <T w={400} s={13} lh={1.45} c={t.fg2} style={{ flex: 1 }}>{n}</T>
                            </Row>
                        ))}
                    </View>
                ) : null}

                {busy || phase === 'error' ? (
                    <View style={{ marginBottom: 16 }}>
                        <Row justify="space-between" style={{ marginBottom: 9 }}>
                            <Eyebrow s={9} ls={0.1} c={phase === 'error' ? t.coral : t.fg2}>
                                {PHASE_LABEL[phase]}
                            </Eyebrow>
                            {phase === 'downloading' ? (
                                <Eyebrow s={9} ls={0.1} c={t.fg3}>{`${Math.round(progress * 100)}%`}</Eyebrow>
                            ) : null}
                        </Row>
                        {phase !== 'error' ? (
                            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.line, overflow: 'hidden' }}>
                                <View style={{ width: `${Math.max(4, Math.round(progress * 100))}%`, height: '100%', borderRadius: 3, backgroundColor: t.lime }} />
                            </View>
                        ) : (
                            <T w={400} s={12} lh={1.45} c={t.coral}>{errorText}</T>
                        )}
                    </View>
                ) : null}

                {!busy ? (
                    <Row gap={10}>
                        <Press
                            onPress={() => setVisible(false)}
                            style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}
                        >
                            <T w={600} s={14} c={t.fg2}>Later</T>
                        </Press>
                        <Press
                            onPress={updateNow}
                            style={{ flex: 1.4, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                        >
                            <Glyph name="cloud-download-outline" size={17} color={t.on} />
                            <T w={700} s={14} c={t.on}>{phase === 'error' ? 'Retry' : 'Update now'}</T>
                        </Press>
                    </Row>
                ) : null}
            </Animated.View>
        </View>
    );
}

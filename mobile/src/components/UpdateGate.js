// File: mobile/src/components/UpdateGate.js
// -----------------------------------------------------------------------------
// OTA UPDATE PROMPT
//
// A bottom sheet that slides up from the bottom edge when an EAS Update is
// available, with:
//   • a live progress bar and phase label while the update installs
//   • "What's new" notes taken from the ACTUAL published patch (see below)
//   • ✕ to dismiss, "Update later", and "Update now"
//
// Where the notes come from:
//   The publish workflow runs mobile/scripts/set-changelog.js, which writes the
//   real commit subjects of the patch being shipped into app.json →
//   expo.extra.releaseNotes. That config travels inside the update manifest, so
//   this sheet shows notes for the INCOMING version instead of a hand-written
//   string that goes stale.
//
// Honest note on the progress bar:
//   expo-updates does not expose byte-level download progress — fetchUpdateAsync
//   resolves once, with no progress callback. So the bar is driven by real
//   lifecycle phases (checking → downloading → installing → restarting) and,
//   during the download, eases toward but never reaches 92%. It snaps to 100%
//   only once the download has genuinely completed. It never claims to be done
//   before it is: a truthful activity indicator, not a fabricated byte counter.
// -----------------------------------------------------------------------------
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, AppState, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, GlassButton, GlassView, ProgressBar } from '../ui';
import { useTheme } from '../theme';

const PHASE_LABEL = {
    idle: '',
    checking: 'Checking for updates…',
    downloading: 'Downloading update…',
    installing: 'Installing…',
    restarting: 'Restarting TenantPro…',
    error: 'Update failed'
};

const DOWNLOAD_CEILING = 0.92; // never pretend the download finished

export default function UpdateGate({ children }) {
    const t = useTheme();
    const [visible, setVisible] = useState(false);
    const [notes, setNotes] = useState([]);
    const [version, setVersion] = useState(null);
    const [phase, setPhase] = useState('idle');
    const [progress, setProgress] = useState(0);
    const [errorText, setErrorText] = useState('');

    const tickRef = useRef(null);
    const busy = phase === 'downloading' || phase === 'installing' || phase === 'restarting';

    // Keep the latest `busy` readable from the AppState listener without
    // re-subscribing (which would tear down the listener mid-install).
    const busyRef = useRef(busy);
    useEffect(() => { busyRef.current = busy; }, [busy]);

    const clearTick = useCallback(() => {
        if (tickRef.current) {
            clearInterval(tickRef.current);
            tickRef.current = null;
        }
    }, []);

    useEffect(() => clearTick, [clearTick]);

    // Pull release notes out of an update manifest. EAS nests the app config
    // under extra.expoClient for modern manifests; older shapes put it at the
    // top level, so check both and accept an array or a newline-joined string.
    const readNotes = (manifest) => {
        const m = manifest || {};
        const extra =
            (m.extra && m.extra.expoClient && m.extra.expoClient.extra) ||
            m.extra ||
            {};

        const raw = extra.releaseNotes ?? extra.whatsNew;
        const list = Array.isArray(raw)
            ? raw
            : typeof raw === 'string'
                ? raw.split('\n')
                : [];

        const cleaned = list
            .map((line) => String(line).trim().replace(/^[-•*]\s*/, ''))
            .filter(Boolean);

        const ver =
            extra.releaseVersion ||
            (m.extra && m.extra.expoClient && m.extra.expoClient.version) ||
            null;

        return { cleaned, ver };
    };

    const checkForUpdate = useCallback(async () => {
        // Only meaningful in a real build with updates enabled (never in dev).
        if (__DEV__ || !Updates.isEnabled) return;
        if (busyRef.current) return; // don't interrupt a running install
        try {
            const result = await Updates.checkForUpdateAsync();
            if (result.isAvailable) {
                const { cleaned, ver } = readNotes(result.manifest);
                setNotes(cleaned);
                setVersion(ver);
                setErrorText('');
                setPhase('idle');
                setProgress(0);
                setVisible(true);
            }
        } catch (e) {
            // Offline or update server unreachable — stay silent.
        }
    }, []);

    useEffect(() => {
        checkForUpdate();
        const sub = AppState.addEventListener('change', (state) => {
            if (state === 'active') checkForUpdate();
        });
        return () => sub.remove();
    }, [checkForUpdate]);

    const handleUpdateNow = async () => {
        setErrorText('');
        setPhase('downloading');
        setProgress(0.06);

        // Ease toward the ceiling while the real download runs. Deliberately
        // asymptotic: it slows as it climbs and stops short of completion.
        clearTick();
        tickRef.current = setInterval(() => {
            setProgress((p) => (p >= DOWNLOAD_CEILING ? p : p + (DOWNLOAD_CEILING - p) * 0.08));
        }, 220);

        try {
            await Updates.fetchUpdateAsync();   // resolves only when fully downloaded
            clearTick();
            setProgress(1);                     // now it is honestly complete
            setPhase('installing');

            // Brief beat so the completed bar is actually perceivable.
            await new Promise((r) => setTimeout(r, 450));
            setPhase('restarting');
            await Updates.reloadAsync();        // process restarts here
        } catch (e) {
            clearTick();
            setPhase('error');
            setProgress(0);
            setErrorText(
                e?.message
                    ? `Could not install the update: ${e.message}`
                    : 'Could not install the update. Please check your connection and try again.'
            );
        }
    };

    const dismiss = () => {
        if (busy) return; // can't cancel a restart mid-flight
        setVisible(false);
        setPhase('idle');
        setProgress(0);
        clearTick();
    };

    return (
        <>
            {children}

            <BottomSheet
                visible={visible}
                onClose={dismiss}
                showClose={!busy}
                dismissOnBackdrop={!busy}
                swipeToDismiss={!busy}
            >
                <View style={styles.headRow}>
                    <GlassView radius={t.radii.lg} style={styles.iconTile} sheen={false}>
                        <Ionicons
                            name={phase === 'error' ? 'alert-circle-outline' : 'cloud-download-outline'}
                            size={24}
                            color={phase === 'error' ? t.colors.danger : t.colors.primary}
                        />
                    </GlassView>

                    <View style={styles.headText}>
                        <Text style={[t.typography.heading, { color: t.colors.text }]}>
                            {phase === 'error' ? 'Update failed' : 'Update available'}
                        </Text>
                        <Text style={[t.typography.caption, { color: t.colors.textMuted, marginTop: 2 }]}>
                            {version ? `Version ${version}` : 'A new version of TenantPro is ready'}
                        </Text>
                    </View>
                </View>

                {/* What's new — real notes from the incoming patch */}
                {notes.length > 0 && phase !== 'error' ? (
                    <GlassView radius={t.radii.lg} style={styles.notesBox}>
                        <Text style={[t.typography.micro, { color: t.colors.textMuted }]}>WHAT'S NEW</Text>
                        {notes.slice(0, 6).map((line, i) => (
                            <View key={i} style={styles.noteRow}>
                                <Ionicons name="sparkles" size={12} color={t.colors.primary} style={styles.noteIcon} />
                                <Text style={[t.typography.body, { color: t.colors.text, flex: 1 }]}>{line}</Text>
                            </View>
                        ))}
                    </GlassView>
                ) : null}

                {errorText ? (
                    <Text style={[t.typography.body, { color: t.colors.danger, marginBottom: t.spacing.lg }]}>
                        {errorText}
                    </Text>
                ) : null}

                {busy ? (
                    <View style={styles.progressBlock}>
                        <View style={styles.progressLabelRow}>
                            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>
                                {PHASE_LABEL[phase]}
                            </Text>
                            <Text style={[t.typography.bodyStrong, { color: t.colors.primary }]}>
                                {Math.round(progress * 100)}%
                            </Text>
                        </View>
                        <ProgressBar progress={progress} height={9} />
                        <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: t.spacing.sm }]}>
                            {phase === 'restarting'
                                ? 'The app will reopen automatically.'
                                : 'Keep the app open while this finishes.'}
                        </Text>
                    </View>
                ) : (
                    <View style={styles.actions}>
                        <GlassButton
                            label={phase === 'error' ? 'Try again' : 'Update now'}
                            icon={phase === 'error' ? 'refresh' : 'arrow-down-circle-outline'}
                            onPress={handleUpdateNow}
                            variant="primary"
                        />
                        <GlassButton
                            label="Update later"
                            onPress={dismiss}
                            variant="ghost"
                            style={{ marginTop: t.spacing.sm }}
                        />
                    </View>
                )}
            </BottomSheet>
        </>
    );
}

const styles = StyleSheet.create({
    headRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    iconTile: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
    headText: { flex: 1, marginLeft: 14 },
    notesBox: { padding: 15, marginBottom: 18 },
    noteRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 9 },
    noteIcon: { marginRight: 8, marginTop: 4 },
    progressBlock: { paddingBottom: Platform.OS === 'ios' ? 6 : 10 },
    progressLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    actions: { paddingBottom: 4 }
});

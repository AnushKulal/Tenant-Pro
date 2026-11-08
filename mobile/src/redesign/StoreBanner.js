// File: mobile/src/redesign/StoreBanner.js
//
// "A new version is available" — across every screen, until it is dealt with.
//
// ── Why a banner and not a sheet ─────────────────────────────────────────────
//
// The OTA prompt is a sheet because it has a button that finishes the job: tap
// it, wait a few seconds, done. This has no such button. The thing it announces
// happens in the store, in another app, and probably not right now.
//
// A sheet for that would be a wall somebody has to get past every launch to
// reach their rent. A line at the top is the right weight: always visible,
// never in the way, and it survives moving between screens because it is
// mounted above them rather than inside any one of them.
//
// ── Where it sits ────────────────────────────────────────────────────────────
//
// Above the header, below the system bars, in the app shell — so it is on every
// page and every module without a single screen knowing it exists. It PUSHES
// content down rather than floating over it: a notice that covers the top of
// the screen it appears on would hide the title of whatever you were reading,
// which is the thing the alignment rule exists to stop.
import React from 'react';
import { View, Linking, Platform } from 'react-native';
import { useT } from './ThemeContext';
import { T, Press, Glyph } from './ui';
import { useStoreUpdate, dismissStoreUpdate, shouldShowStoreBanner } from './storeUpdate';
import { setChromeAbove } from './layout';

export default function StoreBanner() {
    const t = useT();
    const u = useStoreUpdate();
    const showing = shouldShowStoreBanner();

    // Tell the layout rule how much sits above the header. Without this the
    // clamp that keeps a focused field out from under the header measures from
    // the top of the screen, and with this bar on screen a field being typed
    // into can end up behind the header — the exact thing the rule exists to
    // prevent. Cleared when the bar goes, by either route.
    React.useEffect(() => {
        if (!showing) setChromeAbove(0);
        return () => setChromeAbove(0);
    }, [showing]);

    if (!showing) return null;

    const open = () => {
        if (!u.url) return;
        // Opens the store listing or a release link in whatever handles it.
        // Failing silently is right: there is nothing useful to say to somebody
        // whose phone has no browser, and an error toast over a notice they did
        // not ask for is worse than the notice.
        Linking.openURL(u.url).catch(() => {});
    };

    return (
        <View
            onLayout={(e) => setChromeAbove(e.nativeEvent.layout.height)}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                columnGap: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
                backgroundColor: u.mandatory ? t.csoft : t.lsoft,
                borderBottomWidth: 1,
                borderBottomColor: t.line
            }}
        >
            <Glyph
                name={u.mandatory ? 'alert-circle' : 'arrow-down-circle-outline'}
                size={17}
                color={u.mandatory ? t.coral : t.pos}
            />
            <Press onPress={open} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button"
                accessibilityLabel={`Version ${u.latest} is available. Opens the download page.`}>
                <T w={600} s={12.5} lh={1.3} c={t.fg}>
                    {u.mandatory
                        ? `Update required — version ${u.latest}`
                        : `Version ${u.latest} is available`}
                </T>
                {/* What is in it, in one line. A version number alone asks
                    somebody to go and install something for reasons unstated. */}
                <T w={400} s={11} lh={1.35} c={t.fg2} numberOfLines={1} style={{ marginTop: 1 }}>
                    {u.notes.length
                        ? u.notes[0]
                        : 'This one changes the app itself, so it installs from the store.'}
                </T>
            </Press>

            <Press
                onPress={open}
                accessibilityRole="button"
                accessibilityLabel="Get the update"
                style={{
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: 999,
                    backgroundColor: u.mandatory ? t.coral : t.lime
                }}
            >
                <T w={700} s={11.5} c={u.mandatory ? t.ink : t.on}>Get it</T>
            </Press>

            {/* A mandatory update has no ×. It still does not block the screen —
                the app cannot install it either way, and locking somebody out of
                their own rent screen over it would strand them rather than help. */}
            {u.mandatory ? null : (
                <Press
                    onPress={dismissStoreUpdate}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Hide this notice"
                    style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="close" size={14} color={t.fg3} />
                </Press>
            )}
        </View>
    );
}

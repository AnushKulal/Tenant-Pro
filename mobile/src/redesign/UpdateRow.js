// File: mobile/src/redesign/UpdateRow.js
//
// "Check for updates", on both portals' Settings screens.
//
// ── Why it is here ───────────────────────────────────────────────────────────
//
// The app announces an update when it finds one, on launch and whenever it
// comes back to the foreground. That is the right default. But the prompt has a
// Later button, and until now Later was a one-way door: the check lived inside
// the prompt, so the only thing that could start another was the app being
// backgrounded and reopened. Somebody who dismissed it while distracted had no
// way to ask.
//
// So this is the Android-settings-style control: press it, it goes and looks,
// and it tells you what it found either way — including when the answer is
// "nothing", which the automatic check deliberately stays quiet about. A button
// that does nothing visible when there is no update is a button people decide
// is broken.
//
// ── What it says, and what it refuses to say ─────────────────────────────────
//
// Every state carries a description, because "Update available" on its own asks
// somebody to accept a download whose contents they cannot see. The notes come
// from the update manifest, written by the publish workflow out of the real
// commit subjects, so what is listed here is what actually changed.
//
// The one thing it will not do is offer to install a new BUILD. An OTA update
// is new JavaScript for the build already on the phone, and the app can fetch
// and apply that itself. A new build is new native code in a new APK, and
// Android installs that through the package installer — an app that downloads
// and installs its own replacement is the behaviour every store rejects. So
// when there is nothing over the air, this says so and adds that a version with
// changed app code needs a new install, rather than inventing a download it
// cannot perform.
import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useT } from './ThemeContext';
import { T, Press, Glyph } from './ui';
import { useUpdates, check, install, describeUpdateState } from './updates';
import { useStoreUpdate, checkStoreVersion } from './storeUpdate';

export default function UpdateRow({ build }) {
    const t = useT();
    const u = useUpdates();
    const d = describeUpdateState(u, build || {});

    const store = useStoreUpdate();

    const ready = u.phase === 'available';
    const onPress = () => {
        if (d.busy) return;
        if (ready) install();
        else { check({ manual: true }); checkStoreVersion(); }
    };

    // When was it last looked at. Only shown once something has actually been
    // checked, so the row does not claim a check that never ran.
    const ago = (() => {
        if (!u.checkedAt) return '';
        const mins = Math.floor((Date.now() - u.checkedAt) / 60000);
        if (mins < 1) return 'Checked just now';
        if (mins === 1) return 'Checked a minute ago';
        if (mins < 60) return `Checked ${mins} minutes ago`;
        const hrs = Math.floor(mins / 60);
        return hrs === 1 ? 'Checked an hour ago' : `Checked ${hrs} hours ago`;
    })();

    return (
        <View
            style={{
                borderRadius: 20,
                backgroundColor: t.ink2,
                borderWidth: 1,
                borderColor: ready ? t.lime : t.line,
                padding: 16,
                rowGap: 10
            }}
        >
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: 12 }}>
                <View
                    style={{
                        width: 38, height: 38, borderRadius: 12,
                        backgroundColor: ready ? t.lsoft : t.ink3,
                        alignItems: 'center', justifyContent: 'center'
                    }}
                >
                    {d.busy
                        ? <ActivityIndicator size="small" color={t.fg2} />
                        : <Glyph
                            name={ready ? 'cloud-download-outline' : 'refresh-outline'}
                            size={18}
                            color={ready ? t.pos : t.fg2}
                        />}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={600} s={15} lh={1.25} c={t.fg}>{d.title}</T>
                    {d.body ? (
                        <T w={400} s={12.5} lh={1.45} c={t.fg2} style={{ marginTop: 4 }}>{d.body}</T>
                    ) : null}
                </View>
            </View>

            {/* What is in the waiting update, in its own words. Four lines at
                most: this is a summary to decide on, not a changelog to read. */}
            {ready && u.notes.length ? (
                <View style={{ rowGap: 5, paddingLeft: 50 }}>
                    {u.notes.slice(0, 4).map((n, i) => (
                        <View key={i} style={{ flexDirection: 'row', columnGap: 7 }}>
                            <T w={400} s={12} lh={1.45} c={t.fg3}>·</T>
                            <T w={400} s={12} lh={1.45} c={t.fg2} style={{ flex: 1 }}>{n}</T>
                        </View>
                    ))}
                </View>
            ) : null}

            {/* Progress. expo-updates reports no byte count, so this eases
                toward a ceiling while the real download runs and only fills on
                the fetch actually resolving — it never claims to be finished
                before it is. */}
            {u.phase === 'downloading' || u.phase === 'installing' ? (
                <View style={{ height: 4, borderRadius: 999, backgroundColor: t.ink3, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.round((u.progress || 0) * 100)}%`, height: 4, backgroundColor: t.lime }} />
                </View>
            ) : null}

            {d.cta ? (
                <Press
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={d.cta}
                    style={{
                        paddingVertical: 13,
                        borderRadius: 999,
                        backgroundColor: ready ? t.lime : t.ink3,
                        borderWidth: ready ? 0 : 1,
                        borderColor: t.line,
                        alignItems: 'center'
                    }}
                >
                    <T w={700} s={13.5} c={ready ? t.on : t.fg}>{d.cta}</T>
                </Press>
            ) : null}

            {/* The other kind of update. The row above is about the OTA kind,
                which this app can install; this line is about a new build, which
                it cannot. Shown here as well as in the banner so that somebody
                who came to Settings to ask gets the whole answer in one place —
                "you are on the latest version" would otherwise be true of the
                bundle and misleading about the app. */}
            {store.available && store.latest ? (
                <View style={{ borderTopWidth: 1, borderTopColor: t.line, paddingTop: 11, rowGap: 3 }}>
                    <T w={600} s={12.5} lh={1.3} c={t.fg}>
                        {`Version ${store.latest} is available in the store`}
                    </T>
                    <T w={400} s={11.5} lh={1.4} c={t.fg2}>
                        {store.notes.length
                            ? store.notes[0]
                            : 'This one changes the app itself, so it installs from the store rather than from here.'}
                    </T>
                </View>
            ) : null}

            {ago && !d.busy ? (
                <T mono w={500} s={9.5} ls={0.08} c={t.fg3}>{ago.toUpperCase()}</T>
            ) : null}
        </View>
    );
}

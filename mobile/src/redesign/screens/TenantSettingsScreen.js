import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, IconChip } from '../ui';
import PushTestCard from '../PushTestCard';

export default function TenantSettingsScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    return (
        <ScrollView
            contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <Row gap={11} style={{ marginBottom: 16 }}>
                <Press
                    onPress={vm.goTMe}
                    style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="chevron-back" size={17} color={t.fg} />
                </Press>
                <T w={600} s={16} lh={1.1} style={{ flex: 1, letterSpacing: -0.4 }}>Settings</T>
            </Row>

            {/* Appearance */}
            <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 13 }}>APPEARANCE</Eyebrow>
                <Row gap={7} align="stretch">
                    {(vm.themeModes || []).map((tm, i) => (
                        <Press
                            key={i}
                            onPress={tm.go}
                            style={{ flex: 1, paddingVertical: 13, paddingHorizontal: 8, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: col(tm.bd), backgroundColor: col(tm.bg) }}
                        >
                            <Glyph name={tm.icon} size={17} color={col(tm.fg)} style={{ marginBottom: 9 }} />
                            <T mono w={600} s={9} ls={0.08} c={col(tm.fg)}>{tm.label}</T>
                        </Press>
                    ))}
                </Row>
            </View>

            {/* ── Where the rent goes ──────────────────────────────────────────
                This card used to be headed PAYMENT METHODS and listed three saved
                methods that did not exist: a Google Pay handle, an HDFC Visa and a
                PhonePe number, all typed into the source, identical in every install,
                one of them carrying a stranger's name. "DEFAULT" under a saved card
                tells a tenant the app is holding their payment method. It holds
                nothing, and should not.

                So the card now answers the question it can actually answer — where
                their money goes — and the ADD button is gone, because there was never
                a screen behind it. */}
            <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden', marginBottom: 8 }}>
                <Row justify="space-between" style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12 }}>
                    <Eyebrow s={10} ls={0.12} c={t.fg3}>WHERE YOUR RENT GOES</Eyebrow>
                </Row>

                {vm.payCardsEmpty ? (
                    <Row gap={9} align="flex-start" style={{ paddingVertical: 14, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: t.line }}>
                        <Glyph name="information-circle-outline" size={15} color={t.amber} />
                        <T w={500} s={12.5} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.payCardsEmptyLine}</T>
                    </Row>
                ) : (vm.payCards || []).map((pc, i) => (
                    <Row key={i} gap={12} style={{ paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: t.line }}>
                        <IconChip name={pc.icon} size={16} color={t.fg} bg={t.ink3} box={36} radius={12} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={14} lh={1.2} numberOfLines={1}>{pc.label}</T>
                            <Eyebrow s={10} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{pc.sub}</Eyebrow>
                        </View>
                        {!!pc.tag && <Eyebrow s={9} ls={0.06} c={t.pos}>{pc.tag}</Eyebrow>}
                    </Row>
                ))}

                {/* The reassurance that replaces the fiction: there is nothing of
                    theirs here because there is nothing of theirs anywhere. */}
                <View style={{ paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: t.line }}>
                    <T w={400} s={11.5} lh={1.5} c={t.fg3}>{vm.payCardsNote}</T>
                </View>
            </View>

            {/* Checking that a notification actually arrives. A tenant's test can only
                ever reach their own phones — the card draws no number field for them.
                Above the rows, where the "Notifications — ON" stub used to be. */}
            <PushTestCard pt={vm.pushTest} />

            {/* Settings rows */}
            <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden', marginBottom: 8 }}>
                {(vm.tenantSettingsRows || []).map((ts, i) => (
                    <Press key={i} onPress={ts.go}>
                        <Row gap={13} style={{ paddingVertical: 15, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: t.line }}>
                            <IconChip name={ts.icon} size={15} color={t.accent} bg={t.vsoft} box={30} radius={10} />
                            <T w={500} s={14} lh={1.2} style={{ flex: 1 }}>{ts.label}</T>
                            <Eyebrow s={9} ls={0.06} c={t.fg3}>{ts.meta}</Eyebrow>
                            <Glyph name="chevron-forward" size={15} color={t.fg3} />
                        </Row>
                    </Press>
                ))}
            </View>

            {/* Sign out */}
            <Press
                onPress={vm.askSignOut}
                style={{ width: '100%', paddingVertical: 15, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}
            >
                <T w={600} s={13} lh={1} c={t.coral}>Sign out</T>
            </Press>

            {/* The real version — see the note on the owner's Settings screen. This
                was a hardcoded "v2.0 · BUILD 240" from the prototype, which is how an
                install stuck on an old runtimeVersion stayed invisible. */}
            <View style={{ marginTop: 16, alignItems: 'center', rowGap: 4 }}>
                <Eyebrow s={9} ls={0.08} c={t.fg3} style={{ textAlign: 'center', lineHeight: 14 }}>
                    TENANTPRO · {vm.build.versionLine.toUpperCase()}
                </Eyebrow>
                <Eyebrow s={8.5} ls={0.06} c={t.fg3} style={{ textAlign: 'center', lineHeight: 13 }}>
                    {vm.build.bundleLine.toUpperCase()}{vm.build.hasUpdate ? ` · ${vm.build.updateShort.toUpperCase()}` : ''}
                </Eyebrow>
            </View>
        </ScrollView>
    );
}

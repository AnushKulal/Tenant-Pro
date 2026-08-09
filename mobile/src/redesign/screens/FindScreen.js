import React from 'react';
import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Card, Row, Press, Glyph, SearchBar } from '../ui';
import { KeyboardScroll } from '../keyboard';

export default function FindScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    return (
        <KeyboardScroll
            contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, marginBottom: 4 }}>Find a place</T>
            <T w={400} s={13} lh={1.4} c={t.fg2} style={{ marginBottom: 16 }}>{vm.findLine}</T>

            {vm.portalLinked && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: 11, padding: 14, borderRadius: 18, backgroundColor: t.asoft, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}>
                    <Glyph name="information-circle" size={17} color={t.amber} />
                    <T w={400} s={12} lh={1.5} c={t.fg2} style={{ flex: 1 }}>
                        You are already in {vm.me.propName}. Joining somewhere else moves you out of your current room.
                    </T>
                </View>
            )}

            <View style={{ borderRadius: 26, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 20, marginBottom: 8 }}>
                <Press
                    onPress={vm.scanQr}
                    style={{ paddingVertical: 15, borderRadius: 16, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 }}
                >
                    <Glyph name="qr-code" size={18} color={t.on} />
                    <T w={700} s={14} lh={1} c={t.on}>Scan invite QR</T>
                </Press>

                <Row gap={12} style={{ marginVertical: 14 }}>
                    <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                    <T mono w={600} s={9} lh={1} ls={0.1} c={t.fg3}>OR ENTER MANUALLY</T>
                    <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                </Row>

                <SearchBar
                    value={vm.jq}
                    onChangeText={vm.setJq}
                    onSubmitEditing={vm.submitJq}
                    autoCapitalize="characters"
                    placeholder={vm.jqLabel}
                    padV={13}
                    style={{ backgroundColor: t.ink3 }}
                    /* A real lookup needs an explicit submit; the demo catalogue
                       filters as you type, so the button is only shown when it does
                       something. */
                    right={vm.lookup.live ? (
                        <Press onPress={vm.submitJq} disabled={!vm.canSubmitJq} hitSlop={8}>
                            <T mono w={600} s={9} ls={0.1} c={vm.canSubmitJq ? t.accent : t.fg3}>FIND</T>
                        </Press>
                    ) : null}
                />
            </View>

            {/* Area/room-type filters browse the walk-through catalogue. A real
                account has nothing to browse — you find a property because someone
                gave you its code — so they would be dead chips. */}
            {!vm.lookup.live ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginHorizontal: -18, marginBottom: 10 }}
                    contentContainerStyle={{ gap: 7, paddingHorizontal: 18, paddingBottom: 2 }}
                >
                    {vm.jfilters.map((jf, i) => (
                        <Press
                            key={i}
                            onPress={jf.go}
                            style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: col(jf.bd), backgroundColor: col(jf.bg) }}
                        >
                            <T mono w={600} s={9} lh={1} ls={0.08} c={col(jf.fg)}>{jf.label}</T>
                        </Press>
                    ))}
                </ScrollView>
            ) : null}

            {/* Looking one up. */}
            {vm.lookup.loading ? (
                <View style={{ paddingVertical: 28, alignItems: 'center', rowGap: 12 }}>
                    <ActivityIndicator color={t.lime} />
                    <T mono w={600} s={9} ls={0.12} c={t.fg3}>{`LOOKING FOR ${vm.lookup.code}`}</T>
                </View>
            ) : null}

            {vm.lookup.hasError ? (
                <View style={{ paddingVertical: 15, paddingHorizontal: 15, borderRadius: 18, backgroundColor: t.csoft, marginBottom: 8 }}>
                    <Row gap={9} align="flex-start">
                        <Glyph name="alert-circle" size={16} color={t.coral} />
                        <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.lookup.error}</T>
                    </Row>
                    <Press onPress={vm.lookup.retry} style={{ marginTop: 11, alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                        <T w={600} s={12} c={t.fg}>Try again</T>
                    </Press>
                </View>
            ) : null}

            {/* Nothing has been looked for yet — say what to do, rather than
                "no property matches", which accuses a code nobody has typed. */}
            {vm.lookup.live && !vm.lookup.searched && !vm.lookup.loading && !vm.lookup.hasError ? (
                <View style={{ paddingVertical: 24, paddingHorizontal: 16, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                    <T w={400} s={13} lh={1.5} c={t.fg2}>{vm.lookup.idleLine}</T>
                </View>
            ) : null}

            {vm.noJoinResults && (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <T w={500} s={13} lh={1.5} c={t.fg2}>
                        {vm.lookup.live
                            ? 'No property matches that code. Check it with your landlord.'
                            : 'No property matches that name or ID.'}
                    </T>
                </View>
            )}

            {vm.joinResults.map((jr, i) => (
                <View key={i} style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: t.ink2, marginBottom: 8, borderWidth: 1, borderColor: col(jr.bd) }}>
                    <Row gap={13} style={{ paddingVertical: 13, paddingHorizontal: 14 }}>
                        <Image source={jr.img ? { uri: jr.img } : undefined} style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: t.ink3 }} resizeMode="cover" />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={15} lh={1.2} c={t.fg}>{jr.name}</T>
                            <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 4 }}>{jr.loc}</T>
                        </View>
                        <T mono w={600} s={10} lh={1} ls={0.06} c={col(jr.bedFg)}>{jr.beds}</T>
                    </Row>
                    <Row gap={8} style={{ paddingHorizontal: 14, paddingBottom: 13 }}>
                        <Row gap={5} style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.vsoft }}>
                            <Glyph name={jr.policyIcon} size={12} color={t.accent} />
                            <T mono w={600} s={9} lh={1} ls={0.06} c={t.accent}>{jr.policy}</T>
                        </Row>
                        <T mono w={600} s={9} lh={1} ls={0.06} c={t.fg3}>{jr.code}</T>
                        <View style={{ flex: 1 }} />
                        {/* Where you already live reads as a state, not a button. */}
                        <Press
                            onPress={jr.join}
                            disabled={jr.ctaDisabled}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                columnGap: 6,
                                paddingVertical: 9,
                                paddingHorizontal: 14,
                                borderRadius: 999,
                                backgroundColor: col(jr.ctaBg),
                                borderWidth: jr.ctaDisabled ? 1 : 0,
                                borderColor: t.accent
                            }}
                        >
                            {jr.isCurrent ? <Glyph name="checkmark-circle" size={12} color={t.accent} /> : null}
                            <T w={600} s={11} lh={1} c={col(jr.ctaFg)}>{jr.joining && !jr.isCurrent ? 'Sending…' : jr.cta}</T>
                        </Press>
                    </Row>
                </View>
            ))}
        </KeyboardScroll>
    );
}

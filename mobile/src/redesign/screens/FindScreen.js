import React from 'react';
import { View, ScrollView, Image, TextInput } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Card, Row, Press, Glyph } from '../ui';

export default function FindScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    return (
        <ScrollView
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

                <Row gap={10} style={{ paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                    <Glyph name="search" size={16} color={t.fg3} />
                    <TextInput
                        value={vm.jq}
                        onChangeText={vm.setJq}
                        placeholder="Property ID (TP-…) or name"
                        placeholderTextColor={t.fg3}
                        style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: t.font.grotesk[500], fontSize: 13, color: t.fg }}
                    />
                </Row>
            </View>

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

            {vm.noJoinResults && (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                    <T w={500} s={13} lh={1.5} c={t.fg2}>No property matches that name or ID.</T>
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
        </ScrollView>
    );
}

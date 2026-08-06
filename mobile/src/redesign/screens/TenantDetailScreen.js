import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Press, Glyph, Face } from '../ui';

export default function TenantDetailScreen() {
    const vm = useVm();
    const t = useT();
    const who = vm.who;
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    if (!who) return null;

    const credit = who.credit || {};

    return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>
            {/* Hero */}
            <Card radius={26} pad={20} style={{ marginBottom: 8 }}>
                <View style={{ position: 'absolute', right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: col(who.halo) }} />
                <Row gap={14}>
                    <Face uri={who.img} size={64} radius={20} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <T w={700} s={24} lh={1.05} style={{ letterSpacing: -1 }} numberOfLines={1}>{who.name}</T>
                        <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 6 }}>{who.sub}</Eyebrow>
                        <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 6 }}>{who.tenure} · {who.movedIn}</T>
                    </View>
                </Row>
                <Row gap={8} style={{ marginTop: 18 }}>
                    <Press style={{ flex: 1, paddingVertical: 11, borderRadius: 13, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6 }}>
                        <Glyph name="call-outline" size={15} color={t.fg} />
                        <T w={600} s={11} lh={1} c={t.fg}>Call</T>
                    </Press>
                    <Press onPress={vm.openRecord} style={{ flex: 2, paddingVertical: 11, borderRadius: 13, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6 }}>
                        <Glyph name="add-circle-outline" size={15} color={t.on} />
                        <T w={600} s={11} lh={1} c={t.on}>Record payment</T>
                    </Press>
                </Row>
            </Card>

            {/* Action row */}
            <Row gap={7} style={{ marginBottom: 8 }}>
                <Press onPress={vm.openMove} style={{ flex: 1, paddingVertical: 12, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}>
                    <Glyph name="swap-horizontal" size={15} color={t.accent} />
                    <T w={600} s={11} lh={1} c={t.fg}>Move room</T>
                </Press>
                <Press onPress={vm.openRent} style={{ flex: 1, paddingVertical: 12, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}>
                    <Glyph name="pricetag-outline" size={15} color={t.accent} />
                    <T w={600} s={11} lh={1} c={t.fg}>Edit rent</T>
                </Press>
                <Press onPress={vm.openDanger} style={{ width: 46, paddingVertical: 12, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="ellipsis-horizontal" size={17} color={t.fg2} />
                </Press>
            </Row>

            {/* Stats grid */}
            {who.stats && (
                <Row wrap gap={8} align="stretch" style={{ marginBottom: 8 }}>
                    {who.stats.map((s, i) => (
                        <View key={i} style={{ flexBasis: '48%', flexGrow: 1, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 12 }}>
                            <T w={700} s={17} lh={1} c={col(s.fg)} style={{ letterSpacing: -0.6 }}>{s.v}</T>
                            <Eyebrow s={9} ls={0.08} c={t.fg3} style={{ marginTop: 7 }}>{s.k}</Eyebrow>
                        </View>
                    ))}
                </Row>
            )}

            {/* Credit */}
            <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <Eyebrow s={10} ls={0.12} c={t.fg3}>CREDIT SCORE</Eyebrow>
                <Row align="baseline" gap={9} style={{ marginTop: 10 }}>
                    <T w={700} s={34} lh={1} c={col(credit.fg)} style={{ letterSpacing: -1.6 }}>{credit.label}</T>
                    <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7, backgroundColor: col(credit.bg) }}>
                        <Eyebrow s={10} ls={0.06} c={col(credit.fg)}>{credit.band}</Eyebrow>
                    </View>
                </Row>
                <View style={{ position: 'relative', height: 6, borderRadius: 3, backgroundColor: t.line, marginTop: 18, marginBottom: 9 }}>
                    <View style={{ position: 'absolute', left: '50%', top: -4, width: 1, height: 14, backgroundColor: t.line2 }} />
                    <View style={{ position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: t.ink2, backgroundColor: col(credit.fg), left: credit.marker, marginLeft: -7 }} />
                </View>
                <Row justify="space-between" style={{ marginBottom: 14 }}>
                    <Eyebrow s={9} ls={0.06} c={t.fg3}>−100 NEGATIVE</Eyebrow>
                    <Eyebrow s={9} ls={0.06} c={t.fg3}>POSITIVE +100</Eyebrow>
                </Row>
                {(credit.factors || []).map((cf, i) => (
                    <Row key={i} gap={12} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.line }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={500} s={13} lh={1.2} c={t.fg}>{cf.label}</T>
                            <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{cf.detail}</Eyebrow>
                        </View>
                        <T w={700} s={14} lh={1} c={col(cf.fg)}>{cf.pts}</T>
                    </Row>
                ))}
            </Card>

            {/* Timeline */}
            <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 14 }}>PAYMENT TIMELINE</Eyebrow>
                {(who.timeline || []).map((tl, i) => (
                    <Row key={i} gap={12} style={{ paddingVertical: 9 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: col(tl.dot) }} />
                        <T w={500} s={13} lh={1} c={t.fg} style={{ flex: 1 }}>{tl.month}</T>
                        <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginRight: 10 }}>{tl.method}</Eyebrow>
                        <T w={700} s={13} lh={1} c={col(tl.fg)}>{tl.amt}</T>
                    </Row>
                ))}
            </Card>

            {/* Documents */}
            <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18 }}>
                <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 12 }}>DOCUMENTS</Eyebrow>
                <Row gap={8} align="stretch">
                    {(who.docs || []).map((d, i) => (
                        <View key={i} style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, paddingVertical: 12, paddingHorizontal: 10, rowGap: 9, alignItems: 'flex-start' }}>
                            <Glyph name={d.icon} size={17} color={t.accent} />
                            <Eyebrow s={10} ls={0.05} c={t.fg2}>{d.label}</Eyebrow>
                        </View>
                    ))}
                </Row>
            </Card>
        </ScrollView>
    );
}

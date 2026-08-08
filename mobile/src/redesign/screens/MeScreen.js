import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Pill, Press, Glyph, Face } from '../ui';

export default function MeScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const me = vm.me;
    const cr = vm.myCredit;

    return (
        <ScrollView
            contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, marginBottom: 16 }}>My profile</T>

            {me && (
                <>
                    {/* Profile header card */}
                    <Card radius={26} pad={20} style={{ marginBottom: 8 }}>
                        {cr && (
                            <View style={{ position: 'absolute', right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: col(cr.bg) }} />
                        )}
                        <Row gap={14}>
                            <Face uri={me.img} size={64} radius={20} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={24} lh={1.05} style={{ letterSpacing: -1 }}>{me.name}</T>
                                <T mono w={600} s={10} lh={1.4} ls={0.08} c={t.fg3} style={{ marginTop: 6 }}>{me.unitLine}</T>
                                <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 6 }}>{me.movedIn}</T>
                            </View>
                        </Row>
                    </Card>

                    {/* Stats grid */}
                    <Row wrap gap={8} style={{ marginBottom: 8 }}>
                        {vm.myStats.map((ms, i) => (
                            <View key={i} style={{ flexBasis: '48%', flexGrow: 1, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 12 }}>
                                <T w={700} s={17} lh={1} c={col(ms.fg)} style={{ letterSpacing: -0.6 }}>{ms.v}</T>
                                <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.fg3} style={{ marginTop: 7 }}>{ms.k}</T>
                            </View>
                        ))}
                    </Row>

                    {/* Credit score */}
                    {cr && (
                        <Card radius={22} style={{ marginBottom: 8, paddingHorizontal: 18 }}>
                            <Eyebrow s={10} ls={0.12}>YOUR CREDIT SCORE</Eyebrow>
                            <Row align="baseline" gap={9} style={{ marginTop: 10 }}>
                                <T w={700} s={34} lh={1} c={col(cr.fg)} style={{ letterSpacing: -1.6 }}>{cr.label}</T>
                                <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7, backgroundColor: col(cr.bg) }}>
                                    <T mono w={600} s={10} lh={1.3} ls={0.06} c={col(cr.fg)}>{cr.band}</T>
                                </View>
                            </Row>
                            <View style={{ position: 'relative', height: 6, borderRadius: 3, backgroundColor: t.line, marginTop: 18, marginBottom: 9 }}>
                                <View style={{ position: 'absolute', left: '50%', top: -4, width: 1, height: 14, backgroundColor: t.line2 }} />
                                <View style={{ position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: t.ink2, backgroundColor: col(cr.fg), left: cr.marker, transform: [{ translateX: -7 }] }} />
                            </View>
                            <Row justify="space-between" style={{ marginBottom: 14 }}>
                                <Eyebrow s={9} ls={0.06}>−100 NEGATIVE</Eyebrow>
                                <Eyebrow s={9} ls={0.06}>POSITIVE +100</Eyebrow>
                            </Row>
                            {cr.factors.map((mf, i) => (
                                <Row key={i} gap={12} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.line }}>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <T w={500} s={13} lh={1.2} c={t.fg}>{mf.label}</T>
                                        <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{mf.detail}</T>
                                    </View>
                                    <T w={700} s={14} lh={1} c={col(mf.fg)}>{mf.pts}</T>
                                </Row>
                            ))}
                            <T mono w={600} s={9} lh={1.6} ls={0.06} c={t.fg3} style={{ marginTop: 12 }}>PAY ON TIME TO KEEP THIS CLIMBING · LANDLORDS SEE IT WHEN YOU APPLY</T>
                        </Card>
                    )}

                    {/* Payment timeline */}
                    <Card radius={22} style={{ marginBottom: 8, paddingHorizontal: 18 }}>
                        <Eyebrow s={10} ls={0.12} style={{ marginBottom: 14 }}>PAYMENT TIMELINE</Eyebrow>
                        {vm.myTimeline.map((mt2, i) => (
                            <Row key={i} gap={12} style={{ paddingVertical: 9 }}>
                                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: col(mt2.dot) }} />
                                <T w={500} s={13} lh={1} c={t.fg} style={{ flex: 1 }}>{mt2.month}</T>
                                <T mono w={600} s={9} lh={1} ls={0.06} c={t.fg3} style={{ marginRight: 10 }}>{mt2.method}</T>
                                <T w={700} s={13} lh={1} c={col(mt2.fg)}>{mt2.amt}</T>
                            </Row>
                        ))}
                    </Card>

                    {/* Receipts */}
                    <Card radius={22} pad={0} style={{ marginBottom: 8 }}>
                        <Eyebrow s={10} ls={0.12} style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 12 }}>RECEIPTS</Eyebrow>
                        {vm.myPayments.map((mp, i) => (
                            <Row key={i} gap={12} style={{ paddingVertical: 13, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: t.line }}>
                                <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="checkmark" size={16} color={t.pos} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2}>{mp.amt}</T>
                                    <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{mp.sub}</T>
                                </View>
                                <Press onPress={vm.noop} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                    <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg2}>PDF</T>
                                </Press>
                            </Row>
                        ))}
                    </Card>

                    {/* Documents */}
                    <Card radius={22} style={{ marginBottom: 8, paddingHorizontal: 18 }}>
                        <Eyebrow s={10} ls={0.12} style={{ marginBottom: 12 }}>DOCUMENTS</Eyebrow>
                        <Row gap={8} align="stretch">
                            {vm.myDocs.map((md, i) => (
                                <View key={i} style={{ flex: 1, borderRadius: 14, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'flex-start', rowGap: 9 }}>
                                    <Glyph name={md.icon} size={17} color={t.accent} />
                                    <T mono w={600} s={9} lh={1.3} ls={0.06} c={t.fg2}>{md.label}</T>
                                </View>
                            ))}
                        </Row>
                    </Card>

                    {/* Action buttons */}
                    <Row gap={8} style={{ marginBottom: 8 }}>
                        <Press onPress={vm.goStay} style={{ flex: 1, padding: 15, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}>
                            <Glyph name="bed-outline" size={16} color={t.accent} />
                            <T w={600} s={13} lh={1} c={t.fg}>My place</T>
                        </Press>
                        <Press onPress={vm.goTSettings} style={{ flex: 1, padding: 15, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}>
                            <Glyph name="settings-outline" size={16} color={t.accent} />
                            <T w={600} s={13} lh={1} c={t.fg}>Settings</T>
                        </Press>
                    </Row>

                    {/* ID proofs. Its own row rather than a third button, because the
                        nudge below it needs the width to say why it matters. */}
                    <Press onPress={vm.goTDocs} style={{ width: '100%', padding: 15, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: vm.idNag ? t.amber : t.line, marginBottom: 8 }}>
                        <Row gap={10}>
                            <Glyph name={vm.idNag ? 'shield-outline' : 'shield-checkmark-outline'} size={16} color={vm.idNag ? t.amber : t.accent} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={13} lh={1.2} c={t.fg}>My documents</T>
                                {vm.idNag ? (
                                    <T w={400} s={11.5} lh={1.4} c={t.amber} style={{ marginTop: 5 }}>{vm.idNag.line}</T>
                                ) : null}
                            </View>
                            <Glyph name="chevron-forward" size={15} color={t.fg3} />
                        </Row>
                    </Press>

                    {/* Sign out */}
                    <Press onPress={vm.askSignOut} style={{ width: '100%', padding: 15, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                        <T w={600} s={13} lh={1} c={t.coral}>Sign out</T>
                    </Press>
                </>
            )}
        </ScrollView>
    );
}

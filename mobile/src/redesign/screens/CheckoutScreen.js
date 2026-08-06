import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Press, Glyph } from '../ui';

export default function CheckoutScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <ScrollView
            contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <Row gap={11} style={{ marginBottom: 16 }}>
                <Press
                    onPress={vm.goPortal}
                    style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="chevron-back" size={17} color={t.fg} />
                </Press>
                <T w={600} s={16} lh={1.1} style={{ flex: 1, letterSpacing: -0.4 }}>Payment</T>
                <Row gap={5} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.lsoft }}>
                    <Glyph name="lock-closed" size={11} color={t.pos} />
                    <T mono w={600} s={9} lh={1} ls={0.06} c={t.pos}>SECURE</T>
                </Row>
            </Row>

            {vm.unpaid && (
                <>
                    <Card radius={24} pad={18} style={{ marginBottom: 8 }}>
                        <Eyebrow s={10} ls={0.12} c={t.fg3}>PAYING</Eyebrow>
                        <T w={700} s={38} lh={1} style={{ marginTop: 12, letterSpacing: -1.9 }}>{vm.me.rent}</T>
                        <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 7 }}>{vm.me.home}</T>
                        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
                            {vm.payBreakdown.map((pb, i) => (
                                <Row key={i} justify="space-between" style={{ paddingVertical: 5 }}>
                                    <T w={400} s={13} lh={1.3} c={t.fg2}>{pb.k}</T>
                                    <T w={600} s={13} lh={1.3} c={t.fg}>{pb.v}</T>
                                </Row>
                            ))}
                        </View>
                    </Card>

                    <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginTop: 18, marginBottom: 10 }}>HOW DO YOU WANT TO PAY?</Eyebrow>
                    <View style={{ rowGap: 7 }}>
                        {vm.payMethods.map((pm, i) => (
                            <Press
                                key={pm.id != null ? pm.id : i}
                                onPress={pm.go}
                                style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12, width: '100%', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: t[pm.bd], backgroundColor: t[pm.bg] }}
                            >
                                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name={pm.icon} size={17} color={t.fg} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{pm.label}</T>
                                    <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{pm.sub}</T>
                                </View>
                                <Glyph name={pm.check} size={19} color={t[pm.checkFg]} />
                            </Press>
                        ))}
                    </View>

                    <Press
                        onPress={vm.payNow}
                        style={{ width: '100%', marginTop: 16, paddingVertical: 17, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}
                    >
                        <T w={700} s={15} lh={1} c={t.on}>{vm.payLabel}</T>
                    </Press>
                    <T mono w={600} s={9} lh={1.6} ls={0.06} c={t.fg3} style={{ textAlign: 'center', marginTop: 14 }}>PAID STRAIGHT TO YOUR LANDLORD · NO PLATFORM FEE</T>
                </>
            )}

            {vm.paid && (
                <>
                    <Card radius={26} pad={0} style={{ alignItems: 'center', paddingVertical: 52, paddingHorizontal: 20 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: t.lime, alignItems: 'center', justifyContent: 'center' }}>
                            <Glyph name="checkmark" size={30} color={t.on} />
                        </View>
                        <T w={700} s={28} lh={1.05} style={{ marginTop: 18, textAlign: 'center', letterSpacing: -1.3 }}>{vm.me.rent} sent</T>
                        <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 9, maxWidth: 250, textAlign: 'center' }}>Your landlord confirms it, then it appears in your receipts and clears the month.</T>
                        <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg3} style={{ marginTop: 16 }}>REF · TP2608RS4471</T>
                    </Card>
                    <Press
                        onPress={vm.payDone}
                        style={{ width: '100%', marginTop: 10, paddingVertical: 17, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}
                    >
                        <T w={700} s={15} lh={1} c={t.on}>Back to home</T>
                    </Press>
                </>
            )}
        </ScrollView>
    );
}

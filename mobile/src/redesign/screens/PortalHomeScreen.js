import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Pill, Press, Glyph, IconChip, Face } from '../ui';

export default function PortalHomeScreen() {
    const vm = useVm();
    const t = useT();
    const me = vm.me || {};

    return (
        <ScrollView
            contentContainerStyle={{ paddingTop: 14, paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Welcome header */}
            <Row gap={12} style={{ marginBottom: 20 }}>
                <Face uri={me.img} size={42} radius={14} style={{ backgroundColor: t.accent }} />
                <View style={{ flex: 1 }}>
                    <Eyebrow s={9} ls={0.1} c={t.fg3}>WELCOME BACK</Eyebrow>
                    <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.8, marginTop: 5 }}>
                        {me.name || 'Rahul'}
                    </T>
                </View>
                <Press
                    onPress={vm.askSignOut}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        columnGap: 6,
                        paddingVertical: 9,
                        paddingHorizontal: 13,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: t.line,
                        backgroundColor: t.ink2
                    }}
                >
                    <Glyph name="log-out-outline" size={15} color={t.fg2} />
                    <T mono w={600} s={10} ls={0.06} c={t.fg2}>SIGN OUT</T>
                </Press>
            </Row>

            {/* Unlinked empty state */}
            {vm.portalUnlinked && (
                <View
                    style={{
                        alignItems: 'center',
                        paddingVertical: 44,
                        paddingHorizontal: 20,
                        borderRadius: 22,
                        backgroundColor: t.ink2,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: t.line2,
                        marginBottom: 8
                    }}
                >
                    <IconChip name="home-outline" box={44} radius={14} size={20} bg={t.vsoft} color={t.accent} />
                    <T w={600} s={15} lh={1.3} c={t.fg} style={{ marginTop: 14 }}>No property yet</T>
                    <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7, maxWidth: 240, textAlign: 'center' }}>
                        Scan your landlord's invite QR, enter a property ID, or search by name.
                    </T>
                    <Press
                        onPress={vm.goFind}
                        style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.lime }}
                    >
                        <T w={600} s={12} c={t.on}>Find a property</T>
                    </Press>
                </View>
            )}

            {/* Linked: rent card + stats + requests */}
            {vm.portalLinked && (
                <>
                    <View style={{ borderRadius: 28, backgroundColor: t.lime, padding: 22, overflow: 'hidden', marginBottom: 8 }}>
                        <View style={{ position: 'absolute', right: -30, top: -30, width: 130, height: 130, borderRadius: 65, backgroundColor: 'rgba(0,0,0,.06)' }} />
                        <Row justify="space-between">
                            <Eyebrow s={9} ls={0.12} c={t.on} style={{ opacity: 0.6 }}>RENT DUE</Eyebrow>
                            <View style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.on }}>
                                <T mono w={600} s={8} lh={1.3} ls={0.08} c={t.lime}>IN 24 DAYS</T>
                            </View>
                        </Row>
                        <T w={700} s={48} lh={1} c={t.on} style={{ letterSpacing: -2.6, marginTop: 16 }}>{me.rent}</T>
                        <T w={400} s={12} lh={1} c={t.on} style={{ opacity: 0.66, marginTop: 8 }}>{me.home}</T>
                        <Press
                            onPress={vm.goCheckout}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, width: '100%', marginTop: 20, padding: 15, borderRadius: 999, backgroundColor: t.on }}
                        >
                            <T w={700} s={14} c={t.lime}>Pay</T>
                            <Glyph name="arrow-forward" size={16} color={t.lime} />
                        </Press>
                    </View>

                    {/* Stats grid */}
                    <Row gap={8} align="stretch" style={{ marginBottom: 8 }}>
                        <View style={{ flex: 1, borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                            <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{me.deposit}</T>
                            <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 8 }}>DEPOSIT HELD</Eyebrow>
                        </View>
                        <View style={{ flex: 1, borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                            <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{me.since}</T>
                            <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 8 }}>{me.movedIn}</Eyebrow>
                        </View>
                    </Row>

                    {/* Requests */}
                    <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                        <Row justify="space-between" style={{ marginBottom: 14 }}>
                            <Eyebrow s={9} ls={0.12} c={t.fg3}>REQUESTS</Eyebrow>
                            <Press
                                onPress={vm.noop}
                                style={{ flexDirection: 'row', alignItems: 'center', columnGap: 3, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.vsoft }}
                            >
                                <Glyph name="add" size={13} color={t.accent} />
                                <T mono w={600} s={8} ls={0.08} c={t.accent}>NEW</T>
                            </Press>
                        </Row>
                        {(vm.requests || []).map((rq, i) => (
                            <Row key={i} gap={10} style={{ paddingVertical: 9 }}>
                                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: t[rq.dot] }} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={500} s={13} lh={1.2}>{rq.title}</T>
                                    <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 3 }}>{rq.sub}</Eyebrow>
                                </View>
                                <T mono w={600} s={8} ls={0.08} c={t[rq.dot]}>{rq.status}</T>
                            </Row>
                        ))}
                    </Card>
                </>
            )}

            {/* Linked: landlord contact */}
            {vm.portalLinked && (
                <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
                    <Face uri="https://randomuser.me/api/portraits/men/32.jpg" size={40} radius={13} style={{ backgroundColor: t.accent }} />
                    <View style={{ flex: 1 }}>
                        <T w={600} s={14} lh={1.2}>Demo Landlord</T>
                        <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 4 }}>+91 90000 00000</Eyebrow>
                    </View>
                    <Press
                        onPress={vm.noop}
                        style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}
                    >
                        <Glyph name="call" size={16} color={t.pos} />
                    </Press>
                </Card>
            )}
        </ScrollView>
    );
}

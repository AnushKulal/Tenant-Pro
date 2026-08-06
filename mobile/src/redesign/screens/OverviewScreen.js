import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Press, Glyph, Face } from '../ui';

export default function OverviewScreen() {
    const vm = useVm();
    const t = useT();
    // Resolve a colour that is either a token key or a literal hex/rgb string.
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <Row align="flex-end" justify="space-between" style={{ marginBottom: 18 }}>
                <View>
                    <Eyebrow s={9} ls={0.12} c={t.fg3}>THU 6 AUG</Eyebrow>
                    <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, marginTop: 7 }}>
                        {vm.todayTitle}
                    </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <Eyebrow s={9} ls={0.1} c={t.fg3}>OCCUPANCY</Eyebrow>
                    <T w={700} s={20} lh={1} c={t.fg} style={{ marginTop: 7 }}>
                        {vm.occupancyStr}
                        <T w={700} s={12} c={t.fg2}>%</T>
                    </T>
                </View>
            </Row>

            {/* BENTO */}
            {/* Collected — full width */}
            <Card radius={24} pad={18} rail style={{ marginBottom: 8 }}>
                <Row align="flex-start" justify="space-between">
                    <View style={{ flex: 1 }}>
                        <Eyebrow s={9} ls={0.12} c={t.fg3}>COLLECTED — AUGUST</Eyebrow>
                        <T w={700} s={42} lh={1} style={{ letterSpacing: -2.2, marginTop: 10 }}>
                            {vm.collectedStr}
                        </T>
                        <T w={400} s={12} lh={1} c={t.fg2} style={{ marginTop: 6 }}>
                            {vm.expectedStr}
                        </T>
                    </View>
                    <View style={{ flexDirection: 'row-reverse' }}>
                        {vm.paidFaces.map((f, i) => (
                            <Face
                                key={i}
                                uri={f}
                                size={26}
                                radius={13}
                                style={{ borderWidth: 2, borderColor: t.ink2, marginRight: -8 }}
                            />
                        ))}
                    </View>
                </Row>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: t.line, marginTop: 16, overflow: 'hidden', flexDirection: 'row' }}>
                    <View style={{ backgroundColor: t.lime, borderRadius: 3, width: vm.barWidth }} />
                </View>
                <Row justify="space-between" style={{ marginTop: 8 }}>
                    <Eyebrow s={10} ls={0.1} c={t.fg3}>{vm.paidRatio}</Eyebrow>
                    <Eyebrow s={10} ls={0.1} c={t.fg3}>{vm.pctStr}</Eyebrow>
                </Row>
            </Card>

            {/* Pending + Vacant — two columns */}
            <Row gap={8} align="stretch" style={{ marginBottom: 8 }}>
                <Press onPress={vm.openOverdue} style={{ flex: 1 }}>
                    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: t.line, padding: 16, backgroundColor: col(vm.pendingBg) }}>
                        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: col(vm.pendingIconBg) }}>
                            <Glyph name={vm.pendingIcon} size={17} color={col(vm.pendingIconFg)} />
                        </View>
                        <T w={700} s={26} lh={1} c={t.fg} style={{ letterSpacing: -1.2 }}>{vm.pendingStr}</T>
                        <T mono w={600} s={10} lh={1.5} ls={0.1} c={col(vm.pendingSubFg)} style={{ marginTop: 8 }}>{vm.pendingSub}</T>
                    </View>
                </Press>

                <Press onPress={vm.openVacant} style={{ flex: 1 }}>
                    <View style={{ borderRadius: 24, borderWidth: 1, borderColor: t.line, padding: 16, backgroundColor: col(vm.vacantBg) }}>
                        <View style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 14, backgroundColor: col(vm.vacantIconBg) }}>
                            <Glyph name="key" size={16} color={col(vm.vacantIconFg)} />
                        </View>
                        <T w={700} s={26} lh={1} style={{ letterSpacing: -1.2 }}>{vm.vacantNo}</T>
                        <T mono w={600} s={10} lh={1.5} ls={0.1} c={col(vm.vacantSubFg)} style={{ marginTop: 8 }}>{vm.vacantSub}</T>
                    </View>
                </Press>
            </Row>

            {/* Revenue chart — full width */}
            <Card radius={24} style={{ marginBottom: 8, paddingTop: 16, paddingHorizontal: 18, paddingBottom: 14 }}>
                <Row align="center" justify="space-between" style={{ marginBottom: 14 }}>
                    <Eyebrow s={10} ls={0.1} c={t.fg3}>REVENUE · 6 MO</Eyebrow>
                    <Eyebrow s={9} ls={0.06} c={t.pos} style={{ marginLeft: 12 }}>{vm.trendLabel}</Eyebrow>
                </Row>
                <View style={{ position: 'relative', paddingTop: 16 }}>
                    <View style={{ position: 'absolute', top: 16, left: 0, right: 0, height: 0, borderTopWidth: 1, borderStyle: 'dashed', borderColor: t.line2 }} />
                    <View style={{ position: 'absolute', top: 5, left: 0, backgroundColor: t.ink2, paddingRight: 7, zIndex: 1 }}>
                        <Eyebrow s={8} ls={0.06} c={t.fg3}>{vm.peakLabel}</Eyebrow>
                    </View>
                    <Row align="flex-end" gap={8} style={{ height: 78 }}>
                        {vm.bars.map((b, i) => (
                            <View key={i} style={{ flex: 1, flexDirection: 'column', justifyContent: 'flex-end', height: '100%', position: 'relative' }}>
                                {b.showValue && (
                                    <View style={{ position: 'absolute', left: -6, right: -6, alignItems: 'center', bottom: b.h, marginBottom: 5 }}>
                                        <T mono w={600} s={8} lh={1} ls={0.04} c={t.fg}>{b.value}</T>
                                    </View>
                                )}
                                <View style={{ width: '100%', borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, backgroundColor: col(b.fill), height: b.h }} />
                            </View>
                        ))}
                    </Row>
                    <View style={{ height: 1, backgroundColor: t.line, marginTop: 6 }} />
                    <Row gap={8} style={{ marginTop: 8 }}>
                        {vm.bars.map((b, i) => (
                            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                                <T mono w={600} s={8} lh={1} ls={0.06} c={col(b.lab)}>{b.m}</T>
                            </View>
                        ))}
                    </Row>
                </View>
            </Card>

            {/* TICKETS */}
            <Row align="center" justify="space-between" style={{ marginTop: 22, marginBottom: 10 }}>
                <T w={700} s={16} lh={1} style={{ letterSpacing: -0.4 }}>Open tickets</T>
                <Eyebrow s={9} ls={0.08} c={t.fg3}>{vm.ticketTotal}</Eyebrow>
            </Row>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6, paddingHorizontal: 18, paddingBottom: 2 }}
                style={{ marginHorizontal: -18, marginBottom: 12 }}
            >
                {vm.ticketCounts.map((tc, i) => (
                    <Row key={i} align="center" gap={6} style={{ paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: col(tc.bg) }}>
                        <T mono w={600} s={9} lh={1} ls={0.08} c={col(tc.fg)}>{tc.label}</T>
                        <T w={700} s={11} lh={1} c={col(tc.fg)}>{tc.n}</T>
                    </Row>
                ))}
            </ScrollView>

            {vm.ticketsEmpty && (
                <Row align="center" gap={12} style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                    <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Glyph name="checkmark" size={18} color={t.pos} />
                    </View>
                    <T w={500} s={13} lh={1.4} c={t.fg2} style={{ flex: 1 }}>{vm.ticketsEmptyLine}</T>
                </Row>
            )}

            <View style={{ gap: 8 }}>
                {vm.tickets.map((tk, i) => (
                    <Card key={i} radius={20} pad={0} rail={col(tk.fg)}>
                        <View style={{ paddingVertical: 14, paddingHorizontal: 15 }}>
                            <Row align="flex-start" gap={11}>
                                <Image source={{ uri: tk.img }} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.ink3 }} resizeMode="cover" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.25} c={t.fg}>{tk.title}</T>
                                    <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 5 }}>{tk.meta}</T>
                                </View>
                                <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, backgroundColor: col(tk.bg) }}>
                                    <T mono w={600} s={10} lh={1.3} ls={0.05} c={col(tk.fg)}>{tk.priority}</T>
                                </View>
                            </Row>
                            <Row align="center" gap={6} style={{ marginTop: 12 }}>
                                <T mono w={600} s={9} lh={1} ls={0.08} c={col(tk.statusFg)} style={{ flex: 1 }}>{tk.status}</T>
                                <Press onPress={tk.read} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                    <T w={600} s={11} lh={1} c={t.fg}>Read</T>
                                </Press>
                                {tk.started && (
                                    <Press onPress={tk.resolve} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.lime }}>
                                        <T w={600} s={11} lh={1} c={t.on}>Resolve</T>
                                    </Press>
                                )}
                                {tk.notStarted && (
                                    <Press onPress={tk.start} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.lime }}>
                                        <T w={600} s={11} lh={1} c={t.on}>Open</T>
                                    </Press>
                                )}
                            </Row>
                        </View>
                    </Card>
                ))}
            </View>

            {vm.hasMoreTickets && (
                <Press onPress={vm.openAllTickets} style={{ width: '100%', marginTop: 8 }}>
                    <Row align="center" justify="center" gap={8} style={{ paddingVertical: 13, borderRadius: 16, backgroundColor: t.ink2, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line2 }}>
                        <T w={600} s={12} lh={1} c={t.fg2}>{vm.moreTicketsLabel}</T>
                        <Glyph name="chevron-forward" size={14} color={t.fg3} />
                    </Row>
                </Press>
            )}

            {/* RECENT */}
            <Row align="center" justify="space-between" style={{ marginTop: 24, marginBottom: 10 }}>
                <T w={700} s={16} lh={1} style={{ letterSpacing: -0.4 }}>Recent payments</T>
                <Press onPress={vm.goLedger} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                    <Eyebrow s={9} ls={0.08} c={t.fg2}>SEE ALL</Eyebrow>
                </Press>
            </Row>

            <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                {vm.recent.map((p, i) => (
                    <Row key={i} align="center" gap={12} style={{ paddingVertical: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: t.line }}>
                        <Image source={{ uri: p.img }} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.ink3 }} resizeMode="cover" />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={14} lh={1.2}>{p.name}</T>
                            <T mono w={600} s={10} lh={1.4} ls={0.08} c={t.fg3} style={{ marginTop: 3 }}>{p.sub}</T>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <T w={700} s={14} lh={1} c={t.pos}>{p.amt}</T>
                            <T mono w={600} s={9} lh={1} ls={0.06} c={t.fg3} style={{ marginTop: 5 }}>{p.date}</T>
                        </View>
                    </Row>
                ))}
            </View>
        </ScrollView>
    );
}

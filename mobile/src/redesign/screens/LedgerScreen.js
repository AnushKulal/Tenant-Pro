import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Glyph } from '../ui';

export default function LedgerScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>
            <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, marginBottom: 4 }}>Ledger</T>
            <T w={400} s={13} lh={1.4} c={t.fg2} style={{ marginBottom: 16 }}>Every rupee in and out · {vm.ledgerScope}</T>

            {/* Net card */}
            <View style={{ borderRadius: 22, backgroundColor: t.fg, padding: 18, marginBottom: 8, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View>
                    <T mono w={600} s={10} lh={1} ls={0.12} c={t.ink} style={{ opacity: 0.55 }}>NET — AUGUST</T>
                    <T w={700} s={34} lh={1} c={t.ink} style={{ letterSpacing: -1.6, marginTop: 10 }}>{vm.netStr}</T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                    <T mono w={600} s={10} lh={1.7} ls={0.08} c={t.ink} style={{ opacity: 0.55 }}>{vm.inStr}</T>
                    <T mono w={600} s={10} lh={1.7} ls={0.08} c={t.ink} style={{ opacity: 0.55 }}>{vm.outStr}</T>
                </View>
            </View>

            {/* Search */}
            <Row gap={10} style={{ paddingVertical: 13, paddingHorizontal: 16, borderRadius: 16, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginBottom: 18 }}>
                <Glyph name="search" size={17} color={t.fg3} />
                <T w={400} s={13} lh={1} c={t.fg3}>Search tenant, unit or UTR</T>
            </Row>

            {/* Groups */}
            {vm.ledger.map((g, gi) => (
                <View key={gi} style={{ marginBottom: 20 }}>
                    <Row gap={10} style={{ marginBottom: 10 }}>
                        <T mono w={600} s={9} lh={1} ls={0.12} c={t.fg3}>{g.title}</T>
                        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                        <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg2}>{g.total}</T>
                    </Row>
                    <View style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                        {g.rows.map((r, ri) => (
                            <Row key={ri} gap={12} style={{ paddingVertical: 13, paddingHorizontal: 15, borderBottomWidth: 1, borderBottomColor: t.line }}>
                                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: col(r.iconBg), alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name={r.icon} size={14} color={col(r.iconFg)} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2}>{r.name}</T>
                                    <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 3 }}>{r.sub}</T>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <T w={700} s={14} lh={1} c={col(r.fg)}>{r.amt}</T>
                                    <T mono w={600} s={9} lh={1} ls={0.06} c={t.fg3} style={{ marginTop: 5 }}>{r.date}</T>
                                </View>
                            </Row>
                        ))}
                    </View>
                </View>
            ))}
        </ScrollView>
    );
}

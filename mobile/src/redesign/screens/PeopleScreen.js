import React from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Row, Press, Glyph, Face, Avatar, SearchBar } from '../ui';
import { KeyboardScroll } from '../keyboard';

const col = (v, t) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

export default function PeopleScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <KeyboardScroll
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={t.fg2} colors={[t.lime]} progressBackgroundColor={t.ink2} />}
        >
            {/* Title + add tenant */}
            <Row align="flex-start" justify="space-between" gap={12} style={{ marginBottom: 4 }}>
                <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, flex: 1 }}>People</T>
                <Press onPress={vm.addTenant} style={{ marginTop: 3 }}>
                    <Row
                        gap={6}
                        style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.lime }}
                    >
                        <Glyph name="person-add" size={15} color={t.on} />
                        <T w={600} s={11} lh={1} c={t.on}>Add tenant</T>
                    </Row>
                </Press>
            </Row>

            <T w={400} s={13} lh={1.4} c={t.fg2} style={{ marginBottom: 14 }}>{vm.peopleLine}</T>

            {/* Search */}
            <SearchBar
                value={vm.pq}
                onChangeText={vm.setPq}
                onClear={vm.clearPq}
                placeholder="Search by name or property"
                style={{ marginBottom: 14 }}
            />


            {/* Filters */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7, paddingHorizontal: 18, paddingBottom: 2 }}
                style={{ marginHorizontal: -18, marginBottom: 16 }}
            >
                {vm.filters.map((f, i) => (
                    <Press key={i} onPress={f.go}>
                        <View
                            style={{
                                paddingVertical: 9,
                                paddingHorizontal: 14,
                                borderRadius: 999,
                                borderWidth: 1,
                                borderColor: col(f.bd, t),
                                backgroundColor: col(f.bg, t)
                            }}
                        >
                            <T mono w={600} s={9} ls={0.08} c={col(f.fg, t)}>{f.label}</T>
                        </View>
                    </Press>
                ))}
            </ScrollView>

            {/* Empty state */}
            {vm.peopleEmpty && (
                <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                    <T w={500} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.peopleEmptyLine}</T>
                </View>
            )}

            {/* People list */}
            <View style={{ gap: 8 }}>
                {vm.people.map((p, i) => (
                    <Press key={i} onPress={p.open}>
                        <Row
                            gap={12}
                            style={{
                                width: '100%',
                                borderRadius: 20,
                                backgroundColor: col(p.cardBg, t),
                                borderWidth: 1,
                                borderColor: col(p.edge, t) === t.amber ? t.amber : t.line,
                                paddingVertical: 13,
                                paddingHorizontal: 15,
                                overflow: 'hidden'
                            }}
                        >
                            {/* A wider rail on an unassigned tenant, so the row that
                                needs action is the one that catches the eye. */}
                            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: col(p.edge, t) === t.amber ? 4 : 3, backgroundColor: col(p.edge, t) }} />
                            <Avatar uri={p.img} name={p.name} size={44} radius={14} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={15} lh={1.2} c={t.fg} numberOfLines={1}>{p.name}</T>
                                <T mono w={600} s={10} lh={1.4} ls={0.08} c={col(p.subFg, t)} numberOfLines={1} style={{ marginTop: 4 }}>{p.sub}</T>
                                {p.score ? (
                                    <T mono w={600} s={9} lh={1.4} ls={0.08} c={col(p.scoreFg, t)} numberOfLines={1} style={{ marginTop: 3 }}>{p.score}</T>
                                ) : null}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <T w={700} s={15} lh={1} c={t.fg}>{p.rent}</T>
                                <View
                                    style={{
                                        marginTop: 6,
                                        paddingVertical: 3,
                                        paddingHorizontal: 7,
                                        borderRadius: 6,
                                        backgroundColor: col(p.chipBg, t)
                                    }}
                                >
                                    <T mono w={600} s={8} lh={1.3} ls={0.08} c={col(p.chipFg, t)}>{p.chip}</T>
                                </View>
                            </View>
                        </Row>
                    </Press>
                ))}
            </View>
        </KeyboardScroll>
    );
}

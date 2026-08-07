import React from 'react';
import { View, ScrollView, Image, RefreshControl } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Row, Press, Glyph, Face } from '../ui';

// Literal-passthrough resolver: badgeBg/badgeFg are raw rgba/hex; everything
// else is a token key resolved against the theme.
const col = (t, v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

export default function UnitsScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={t.fg2} colors={[t.lime]} progressBackgroundColor={t.ink2} />}
        >
            {/* Title + Add property */}
            <Row align="flex-start" justify="space-between" gap={12} style={{ marginBottom: 4 }}>
                <T w={700} s={30} lh={1.04} style={{ letterSpacing: -1.5, flexShrink: 1 }}>
                    Properties{'\n'}& units
                </T>
                <Press
                    onPress={vm.addProperty}
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: t.lime,
                        marginTop: 4
                    }}
                >
                    <Glyph name="add" size={16} color={t.on} />
                    <T w={600} s={11} lh={1} c={t.on}>Add property</T>
                </Press>
            </Row>

            {/* Summary line + scope clear */}
            <Row align="center" gap={10} style={{ marginBottom: 14 }}>
                <T w={400} s={13} lh={1.4} c={t.fg2}>{vm.unitsLine}</T>
                {vm.scoped && (
                    <Press
                        onPress={vm.clearScope}
                        style={{
                            paddingVertical: 6,
                            paddingHorizontal: 11,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: t.accent,
                            backgroundColor: t.vsoft
                        }}
                    >
                        <T mono w={600} s={9} lh={1} ls={0.08} c={t.accent}>SHOW ALL</T>
                    </Press>
                )}
            </Row>

            {/* Properties strip */}
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -18, marginBottom: 20 }}
                contentContainerStyle={{ gap: 10, paddingHorizontal: 18, paddingBottom: 6 }}
            >
                {vm.properties.map((pr, i) => (
                    <Press
                        key={i}
                        onPress={pr.go}
                        style={{
                            width: 244,
                            borderRadius: 20,
                            overflow: 'hidden',
                            backgroundColor: t.ink2,
                            borderWidth: 2,
                            borderColor: t[pr.border]
                        }}
                    >
                        <View style={{ position: 'relative' }}>
                            <Image
                                source={{ uri: pr.img }}
                                style={{ width: '100%', height: 96, backgroundColor: t.ink3, opacity: pr.dim }}
                                resizeMode="cover"
                            />
                            <View
                                style={{
                                    position: 'absolute',
                                    top: 9,
                                    right: 9,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 5,
                                    paddingVertical: 5,
                                    paddingHorizontal: 9,
                                    borderRadius: 999,
                                    backgroundColor: col(t, pr.badgeBg)
                                }}
                            >
                                <Glyph name={pr.badgeIcon} size={12} color={col(t, pr.badgeFg)} />
                                <T mono w={600} s={9} lh={1} ls={0.06} c={col(t, pr.badgeFg)}>{pr.badge}</T>
                            </View>
                        </View>
                        <View style={{ paddingTop: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
                            <T w={600} s={15} lh={1.2} c={t.fg}>{pr.name}</T>
                            <T mono w={600} s={10} lh={1.4} ls={0.08} c={t.fg3} style={{ marginTop: 4 }}>{pr.loc}</T>
                            <Row align="center" gap={5} style={{ marginTop: 11 }}>
                                {pr.pips.map((pip, j) => (
                                    <View key={j} style={{ width: 14, height: 5, borderRadius: 3, backgroundColor: t[pip] }} />
                                ))}
                                <View style={{ flex: 1 }} />
                                <T mono w={600} s={10} lh={1} ls={0.06} c={t.fg2}>{pr.stat}</T>
                            </Row>
                        </View>
                    </Press>
                ))}
            </ScrollView>

            {/* Units grid */}
            <Row wrap gap={8} align="stretch">
                {vm.units.map((u, i) => (
                    <Press
                        key={i}
                        onPress={u.open}
                        style={{
                            flexBasis: '48%',
                            flexGrow: 1,
                            borderRadius: 20,
                            backgroundColor: t[u.bg],
                            borderWidth: 1,
                            borderColor: t.line,
                            padding: 15,
                            overflow: 'hidden',
                            minHeight: 132,
                            flexDirection: 'column'
                        }}
                    >
                        <Row align="flex-start" justify="space-between">
                            <T w={700} s={26} lh={1} c={t[u.fg]} style={{ letterSpacing: -1.2 }}>{u.no}</T>
                            <View style={{ width: 8, height: 8, borderRadius: 5, backgroundColor: t[u.dot], marginTop: 6 }} />
                        </Row>
                        <T mono w={600} s={10} lh={1.5} ls={0.08} c={t[u.sub]} style={{ marginTop: 9 }}>{u.type}</T>
                        <View style={{ flex: 1 }} />
                        <Row align="flex-end" justify="space-between" style={{ marginTop: 12 }}>
                            <View>
                                <T w={600} s={13} lh={1} c={t[u.fg]}>{u.rent}</T>
                                <T mono w={600} s={10} lh={1} ls={0.06} c={t[u.sub]} style={{ marginTop: 5 }}>{u.beds}</T>
                            </View>
                            <View style={{ flexDirection: 'row-reverse' }}>
                                {u.faces.map((fa, j) => (
                                    <Face
                                        key={j}
                                        uri={fa}
                                        size={22}
                                        radius={11}
                                        style={{ borderWidth: 2, borderColor: t.ink2, marginRight: -7, backgroundColor: t.accent }}
                                    />
                                ))}
                            </View>
                        </Row>
                    </Press>
                ))}

                {/* Add a unit */}
                <Press
                    onPress={vm.addUnit}
                    style={{
                        flexBasis: '48%',
                        flexGrow: 1,
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        justifyContent: 'center',
                        gap: 10,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: t.line2,
                        padding: 15,
                        minHeight: 132
                    }}
                >
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Glyph name="add" size={19} color={t.accent} />
                    </View>
                    <T w={600} s={12} lh={1.3} c={t.fg2}>Add a unit</T>
                </Press>
            </Row>
        </ScrollView>
    );
}

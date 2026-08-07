import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Card, Row, Press, Glyph } from '../ui';

export default function HelpScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const requests = vm.requests || [];
    const landlord = vm.landlord || {};

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            <Row align="flex-start" justify="space-between" gap={12} style={{ marginBottom: 4 }}>
                <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, flexShrink: 1 }}>Help</T>
                <Press
                    onPress={vm.openNewRequest}
                    style={{
                        flexShrink: 0,
                        flexDirection: 'row',
                        alignItems: 'center',
                        columnGap: 6,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: t.lime,
                        marginTop: 3
                    }}
                >
                    <Glyph name="add" size={15} color={t.on} />
                    <T w={600} s={11} lh={1} c={t.on}>Raise a ticket</T>
                </Press>
            </Row>

            <T w={400} s={13} lh={1.4} c={t.fg2} style={{ marginBottom: 16 }}>
                Report an issue and follow it through.
            </T>

            <View style={{ marginBottom: 16, rowGap: 8 }}>
                {requests.map((r, i) => (
                    <Press key={i} onPress={r.open}>
                        <Card radius={20} pad={0} rail={col(r.dot)} style={{ paddingVertical: 14, paddingHorizontal: 15 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={14} lh={1.25} c={t.fg}>{r.title}</T>
                                <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 5 }}>
                                    {r.sub}
                                </T>
                            </View>
                            <T mono w={600} s={9} lh={1} ls={0.08} c={col(r.dot)} style={{ marginTop: 11 }}>
                                {r.status}
                            </T>
                        </Card>
                    </Press>
                ))}
            </View>

            <View
                style={{
                    borderRadius: 22,
                    backgroundColor: t.ink2,
                    borderWidth: 1,
                    borderColor: t.line,
                    paddingVertical: 16,
                    paddingHorizontal: 18,
                    flexDirection: 'row',
                    alignItems: 'center',
                    columnGap: 12
                }}
            >
                {landlord.img ? (
                    <Image
                        source={{ uri: landlord.img }}
                        style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink3 }}
                        resizeMode="cover"
                    />
                ) : (
                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                        <T w={700} s={16} c={t.accent}>{landlord.initial}</T>
                    </View>
                )}
                <View style={{ flex: 1 }}>
                    <T w={600} s={14} lh={1.2} numberOfLines={1}>{landlord.name}</T>
                    <T mono w={600} s={10} lh={1.4} ls={0.08} c={t.fg3} style={{ marginTop: 4 }}>
                        {landlord.phoneLabel}
                    </T>
                </View>
                <Press
                    onPress={landlord.call}
                    style={{
                        width: 38,
                        height: 38,
                        borderRadius: 13,
                        backgroundColor: t.lsoft,
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <Glyph name="call" size={16} color={t.pos} />
                </Press>
            </View>
        </ScrollView>
    );
}

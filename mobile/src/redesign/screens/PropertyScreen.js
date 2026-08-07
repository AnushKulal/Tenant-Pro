import React from 'react';
import { View, ScrollView, Image, RefreshControl } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Divider, Press, Glyph, IconChip } from '../ui';

export default function PropertyScreen() {
    const vm = useVm();
    const t = useT();
    const place = vm.place;
    if (!place) return null;

    return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={vm.refreshing} onRefresh={vm.refresh} tintColor={t.fg2} colors={[t.lime]} progressBackgroundColor={t.ink2} />}>
            {/* Hero card */}
            <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginBottom: 8 }}>
                <View style={{ position: 'relative' }}>
                    <Image source={{ uri: place.img }} style={{ width: '100%', height: 150, backgroundColor: t.ink3 }} resizeMode="cover" />
                    <Row gap={5} style={{ position: 'absolute', top: 12, right: 12, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(8,8,10,.66)' }}>
                        <Glyph name="star" size={12} color={t.lime} />
                        <T w={700} s={12} lh={1} c="#F4F3F7">{place.rating}</T>
                        <T mono w={600} s={9} lh={1} ls={0.06} c="rgba(244,243,247,.6)">{place.reviews}</T>
                    </Row>
                </View>
                <View style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18 }}>
                    <Row gap={7} wrap>
                        <T mono w={600} s={10} lh={1} ls={0.1} c={t.fg3}>{place.type}</T>
                        <Row gap={5} style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.vsoft }}>
                            <Glyph name={place.policyIcon} size={12} color={t.accent} />
                            <T mono w={600} s={9} lh={1} ls={0.06} c={t.accent}>{place.policy}</T>
                        </Row>
                    </Row>
                    <T w={700} s={26} lh={1.05} style={{ letterSpacing: -1.1, marginTop: 9 }}>{place.name}</T>
                    <Row align="flex-start" gap={8} style={{ marginTop: 11 }}>
                        <Glyph name="location-outline" size={15} color={t.fg3} style={{ marginTop: 2 }} />
                        <T w={400} s={13} lh={1.5} c={t.fg2} style={{ flex: 1 }}>{place.address}</T>
                    </Row>
                    <Row gap={9} style={{ marginTop: 16, paddingTop: 15, borderTopWidth: 1, borderTopColor: t.line }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Eyebrow s={9} ls={0.1} c={t.fg3}>PROPERTY ID</Eyebrow>
                            <T w={700} s={14} lh={1} c={t.fg} style={{ marginTop: 6, letterSpacing: 0.5 }}>{place.code}</T>
                        </View>
                        <Press onPress={place.invite}>
                            <Row gap={7} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.lime }}>
                                <Glyph name="qr-code" size={15} color={t.on} />
                                <T w={600} s={11} lh={1} c={t.on}>Invite tenant</T>
                            </Row>
                        </Press>
                    </Row>
                </View>
            </View>

            {/* Map card */}
            <View style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginBottom: 8 }}>
                <Image source={{ uri: place.mapSrc }} style={{ width: '100%', height: 190, backgroundColor: t.ink3 }} resizeMode="cover" />
                <Row gap={7} style={{ padding: 12 }}>
                    <Press onPress={vm.noop} style={{ flex: 1 }}>
                        <Row gap={7} justify="center" style={{ paddingVertical: 11, borderRadius: 13, backgroundColor: t.lime }}>
                            <Glyph name="navigate" size={15} color={t.on} />
                            <T w={600} s={11} lh={1} c={t.on}>Open in Google Maps</T>
                        </Row>
                    </Press>
                    <Press onPress={vm.noop}>
                        <Row gap={6} justify="center" style={{ paddingVertical: 11, paddingHorizontal: 13, borderRadius: 13, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                            <T mono w={600} s={9} lh={1} ls={0.06} c={t.fg2}>OSM</T>
                        </Row>
                    </Press>
                </Row>
            </View>

            {/* Amenities */}
            <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 14 }}>AMENITIES</Eyebrow>
                <Row wrap gap={12}>
                    {(place.amenities || []).map((a, i) => (
                        <Row key={i} gap={10} style={{ flexBasis: '46%', flexGrow: 1, marginBottom: 2 }}>
                            <IconChip name={a.icon} size={15} box={30} radius={10} bg={t.vsoft} color={t.accent} />
                            <T w={500} s={13} lh={1.2} c={t.fg2} style={{ flex: 1 }}>{a.label}</T>
                        </Row>
                    ))}
                </Row>
            </View>

            {/* Food */}
            <Row align="flex-start" gap={13} style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="restaurant" size={18} color={t.pos} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Eyebrow s={10} ls={0.12} c={t.fg3}>FOOD</Eyebrow>
                    <T w={600} s={14} lh={1.25} c={t.fg} style={{ marginTop: 8 }}>{place.food}</T>
                    <T w={400} s={12} lh={1.45} c={t.fg2} style={{ marginTop: 5 }}>{place.foodNote}</T>
                </View>
            </Row>

            {/* Units here */}
            <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18 }}>
                <Row justify="space-between" style={{ marginBottom: 12 }}>
                    <Eyebrow s={10} ls={0.12} c={t.fg3}>UNITS HERE</Eyebrow>
                    <Press onPress={place.viewUnits}>
                        <View style={{ paddingVertical: 6, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                            <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg2}>SEE ALL</T>
                        </View>
                    </Press>
                </Row>
                {(place.units || []).map((pu, i) => (
                    <Row key={i} gap={12} style={{ paddingVertical: 9 }}>
                        <T w={700} s={16} lh={1} c={t.fg} style={{ width: 38 }}>{pu.no}</T>
                        <T w={500} s={13} lh={1.2} c={t.fg2} style={{ flex: 1 }}>{pu.type}</T>
                        <T w={600} s={13} lh={1} c={t.fg} style={{ marginRight: 10 }}>{pu.rent}</T>
                        <T mono w={600} s={9} lh={1} ls={0.06} c={t[pu.fg]} style={{ width: 62, textAlign: 'right' }}>{pu.state}</T>
                    </Row>
                ))}
            </View>
        </ScrollView>
    );
}

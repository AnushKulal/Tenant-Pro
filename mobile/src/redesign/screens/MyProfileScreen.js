import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Face, Glyph, Press, Avatar } from '../ui';

export default function MyProfileScreen() {
    const vm = useVm();
    const t = useT();
    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Profile header card */}
            <View
                style={{
                    borderRadius: 26,
                    backgroundColor: t.ink2,
                    borderWidth: 1,
                    borderColor: t.line,
                    padding: 20,
                    alignItems: 'center',
                    marginBottom: 8
                }}
            >
                <View style={{ position: 'relative' }}>
                    <Avatar uri={vm.ownerImg} name={vm.ownerName} size={88} radius={28} />
                    <Press
                        onPress={vm.noop}
                        style={{
                            position: 'absolute',
                            right: -6,
                            bottom: -6,
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            backgroundColor: t.lime,
                            borderWidth: 3,
                            borderColor: t.ink2,
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <Glyph name="camera" size={15} color={t.on} />
                    </Press>
                </View>
                <T w={700} s={21} lh={1.1} numberOfLines={1} style={{ letterSpacing: -0.7, marginTop: 14 }}>
                    {vm.ownerName || 'Your account'}
                </T>
                <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 7 }}>
                    {vm.profileSubtitle}
                </Eyebrow>
            </View>

            {/* Profile fields */}
            <View
                style={{
                    borderRadius: 22,
                    backgroundColor: t.ink2,
                    borderWidth: 1,
                    borderColor: t.line,
                    overflow: 'hidden',
                    marginBottom: 8
                }}
            >
                {vm.profileFields.map((pf, i) => (
                    <View
                        key={i}
                        style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            columnGap: 13,
                            paddingVertical: 14,
                            paddingHorizontal: 16,
                            borderBottomWidth: 1,
                            borderBottomColor: t.line
                        }}
                    >
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T mono w={600} s={9} ls={0.1} c={t.fg3}>
                                {pf.label}
                            </T>
                            <T w={500} s={14} lh={1.2} c={t.fg} style={{ marginTop: 7 }}>
                                {pf.value}
                            </T>
                        </View>
                        <Press
                            onPress={vm.noop}
                            style={{
                                paddingVertical: 7,
                                paddingHorizontal: 12,
                                borderRadius: 999,
                                backgroundColor: t.ink3,
                                borderWidth: 1,
                                borderColor: t.line
                            }}
                        >
                            <T mono w={600} s={9} ls={0.08} c={t.fg2}>
                                EDIT
                            </T>
                        </Press>
                    </View>
                ))}
            </View>

            {/* Save changes */}
            <Press
                onPress={vm.noop}
                style={{
                    width: '100%',
                    paddingVertical: 15,
                    borderRadius: 18,
                    backgroundColor: t.lime,
                    alignItems: 'center',
                    marginBottom: 8
                }}
            >
                <T w={700} s={14} lh={1} c={t.on}>
                    Save changes
                </T>
            </Press>

            {/* Go to settings */}
            <Press
                onPress={vm.goSettings}
                style={{
                    width: '100%',
                    paddingVertical: 15,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: t.line,
                    alignItems: 'center'
                }}
            >
                <T w={600} s={13} lh={1} c={t.fg2}>
                    Go to settings
                </T>
            </Press>
        </ScrollView>
    );
}

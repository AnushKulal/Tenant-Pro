import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Face, Glyph, Press, Avatar, Row } from '../ui';

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
                        onPress={vm.openEditProfile}
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

                {/* The way in. Every field below used to carry its own edit button
                    wired to "Not wired in this prototype"; one form that opens
                    prefilled is both honest and less tapping. */}
                <Press
                    onPress={vm.openEditProfile}
                    style={{
                        marginTop: 16, paddingVertical: 11, paddingHorizontal: 22,
                        borderRadius: 999, borderWidth: 1, borderColor: t.accent, backgroundColor: t.vsoft
                    }}
                >
                    <Row gap={8}>
                        <Glyph name="create-outline" size={15} color={t.accent} />
                        <T w={700} s={13} lh={1} c={t.accent}>Edit profile</T>
                    </Row>
                </Press>
            </View>

            {/* Something is waiting on a code. Shown here rather than only in the
                moment of saving, because the code arrives a minute later — often on
                another device — and the sheet has to be reachable again by then. */}
            {vm.pendingContact ? (
                <Press
                    onPress={vm.pendingContact.open}
                    style={{
                        borderRadius: 20, backgroundColor: t.asoft, borderWidth: 1, borderColor: t.amber,
                        paddingVertical: 14, paddingHorizontal: 16, marginBottom: 8
                    }}
                >
                    <Row gap={11}>
                        <Glyph name="time-outline" size={17} color={t.amber} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={13} lh={1.3} c={t.amber}>{vm.pendingContact.line}</T>
                            <T w={500} s={12} lh={1.3} c={t.amber} style={{ marginTop: 3 }}>{vm.pendingContact.cta}</T>
                        </View>
                        <Glyph name="chevron-forward" size={15} color={t.amber} />
                    </Row>
                </Press>
            ) : null}

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
                            onPress={pf.editable === false ? undefined : vm.openEditProfile}
                            disabled={pf.editable === false}
                            style={{
                                paddingVertical: 7,
                                paddingHorizontal: 12,
                                borderRadius: 999,
                                backgroundColor: t.ink3,
                                borderWidth: 1,
                                borderColor: t.line
                            }}
                        >
                            <T mono w={600} s={9} ls={0.08} c={pf.editable === false ? t.fg3 : t.fg2}>
                                {pf.editable === false ? '—' : 'EDIT'}
                            </T>
                        </Press>
                    </View>
                ))}
            </View>

            {/* There was a "Save changes" button here, wired to nothing, under fields
                that were not editable — it promised to save edits that could not be
                made. Editing happens in the sheet now, which has its own Update. */}

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

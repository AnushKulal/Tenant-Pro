// File: mobile/src/redesign/Header.js
// Owner shell header (chrome): scope search / back button + notifications bell.
import React from 'react';
import { View } from 'react-native';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { T, Row, Press, Glyph } from './ui';

const BTN = { flexBasis: 36, flexGrow: 0, flexShrink: 0, width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' };

export default function Header() {
    const vm = useVm();
    const t = useT();
    if (!vm.showHeader) return null;

    return (
        <Row
            gap={8}
            style={{ backgroundColor: t.ink, paddingTop: 12, paddingHorizontal: 18, paddingBottom: 10 }}
        >
            {vm.showSearch && (
                <Press
                    onPress={vm.openSearch}
                    style={{
                        flex: 1,
                        minWidth: 0,
                        flexDirection: 'row',
                        alignItems: 'center',
                        columnGap: 9,
                        paddingVertical: 9,
                        paddingHorizontal: 14,
                        borderRadius: 999,
                        backgroundColor: t.ink2,
                        borderWidth: 1,
                        borderColor: t[vm.scopeBorder]
                    }}
                >
                    <Glyph name="search" size={15} color={t[vm.scopeIconFg]} />
                    <T w={500} s={12} lh={1} c={t[vm.scopeFg]} numberOfLines={1} style={{ flex: 1 }}>
                        {vm.scopeHint}
                    </T>
                </Press>
            )}

            {vm.showBack && (
                <>
                    <Press onPress={vm.goBack} style={{ ...BTN, borderWidth: 1, borderColor: t.line }}>
                        <Glyph name="chevron-back" size={17} color={t.fg} />
                    </Press>
                    <T
                        w={600}
                        s={16}
                        lh={1.1}
                        c={t.fg}
                        numberOfLines={1}
                        style={{ flex: 1, letterSpacing: -0.4 }}
                    >
                        {vm.backTitle}
                    </T>
                </>
            )}

            {vm.scoped && (
                <Press onPress={vm.clearScope} style={{ ...BTN, borderWidth: 1, borderColor: t.line }}>
                    <Glyph name="close" size={17} color={t.fg2} />
                </Press>
            )}

            {/* The bell used to open the account menu, making it a duplicate of
                tapping your own avatar. It now opens the alerts sheet, and its dot
                only appears when there is genuinely something to see. */}
            <Press onPress={vm.openAlerts} style={{ ...BTN, borderWidth: 1, borderColor: t.line }}>
                <Glyph name={vm.hasAlerts ? 'notifications' : 'notifications-outline'} size={18} color={vm.hasAlerts ? t.fg : t.fg2} />
                {vm.hasAlerts && (
                    <View
                        style={{
                            position: 'absolute',
                            top: 8,
                            right: 9,
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: t.coral,
                            borderWidth: 1.5,
                            borderColor: t.ink
                        }}
                    />
                )}
            </Press>
        </Row>
    );
}

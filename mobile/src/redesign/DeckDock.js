// File: mobile/src/redesign/DeckDock.js
// Chrome: the bottom deck-dock nav. Owner routes render the `dock` array with a
// "YOU" menu button; tenant routes render `tenantDock` with a "ME" button.
import React from 'react';
import { View } from 'react-native';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { T, Press, Glyph, Face } from './ui';

const DOCK_RADIUS = { borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 6, borderBottomRightRadius: 6 };

export default function DeckDock() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    const tenant = !!(vm.showTenantDock || vm.tenantSide);
    const items = (tenant ? vm.tenantDock : vm.dock) || [];
    const ls = tenant ? 0.06 : 0.08;

    return (
        <View style={{ paddingHorizontal: 10, backgroundColor: t.ink }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', columnGap: 5, height: 74 }}>
                {items.map((d, i) => (
                    <View key={i} style={{ flex: 1, position: 'relative', flexDirection: 'column', justifyContent: 'flex-end', height: 74 }}>
                        <View
                            style={{
                                position: 'absolute',
                                left: '11%',
                                right: '11%',
                                height: 5,
                                borderTopLeftRadius: 4,
                                borderTopRightRadius: 4,
                                backgroundColor: t.line,
                                bottom: parseFloat(d.stackY) || 0,
                                opacity: Number(d.stack) || 0
                            }}
                        />
                        <Press
                            onPress={d.go}
                            style={{
                                width: '100%',
                                height: parseFloat(d.h) || 0,
                                borderTopWidth: 1,
                                borderLeftWidth: 1,
                                borderRightWidth: 1,
                                borderColor: t.line,
                                alignItems: 'center',
                                justifyContent: 'center',
                                rowGap: 5,
                                backgroundColor: col(d.bg),
                                ...DOCK_RADIUS
                            }}
                        >
                            <Glyph name={d.icon} size={19} color={col(d.fg)} />
                            <T mono w={600} s={8} lh={1} ls={ls} c={col(d.fg)} numberOfLines={1}>{d.label}</T>
                        </Press>
                    </View>
                ))}

                {tenant ? (
                    <Press
                        onPress={vm.goTMe}
                        style={{
                            width: 52,
                            height: parseFloat(vm.tmeH) || 52,
                            borderTopWidth: 1,
                            borderLeftWidth: 1,
                            borderRightWidth: 1,
                            borderColor: t.line,
                            alignItems: 'center',
                            justifyContent: 'center',
                            rowGap: 4,
                            backgroundColor: col(vm.tmeBg),
                            ...DOCK_RADIUS
                        }}
                    >
                        <Face uri={vm.me && vm.me.img} size={22} radius={11} />
                        <T mono w={600} s={8} lh={1} ls={0.06} c={col(vm.tmeFg)}>ME</T>
                    </Press>
                ) : (
                    <Press
                        onPress={vm.openMenu}
                        style={{
                            width: 52,
                            height: 52,
                            borderTopWidth: 1,
                            borderLeftWidth: 1,
                            borderRightWidth: 1,
                            borderColor: t.line,
                            alignItems: 'center',
                            justifyContent: 'center',
                            rowGap: 4,
                            backgroundColor: t.ink2,
                            ...DOCK_RADIUS
                        }}
                    >
                        <Face uri={'https://randomuser.me/api/portraits/men/32.jpg'} size={22} radius={11} />
                        <T mono w={600} s={8} lh={1} ls={0.06} c={t.fg2}>YOU</T>
                    </Press>
                )}
            </View>
        </View>
    );
}

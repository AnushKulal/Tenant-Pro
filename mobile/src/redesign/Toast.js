import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { T, Glyph } from './ui';

export default function Toast() {
    const vm = useVm();
    const t = useT();
    const toast = vm.toast;
    const op = useRef(new Animated.Value(0)).current;
    const ty = useRef(new Animated.Value(8)).current;

    useEffect(() => {
        if (toast) {
            op.setValue(0);
            ty.setValue(8);
            Animated.parallel([
                Animated.timing(op, { toValue: 1, duration: 240, useNativeDriver: true }),
                Animated.timing(ty, { toValue: 0, duration: 240, useNativeDriver: true })
            ]).start();
        }
    }, [toast]);

    if (!toast) return null;

    return (
        <Animated.View
            pointerEvents="none"
            style={{
                position: 'absolute',
                left: 18,
                right: 18,
                bottom: 92,
                zIndex: 70,
                opacity: op,
                transform: [{ translateY: ty }],
                alignSelf: 'center'
            }}
        >
            <View
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    columnGap: 10,
                    backgroundColor: t.fg,
                    borderRadius: 16,
                    paddingVertical: 13,
                    paddingHorizontal: 16,
                    shadowColor: '#000',
                    shadowOpacity: 0.3,
                    shadowRadius: 30,
                    shadowOffset: { width: 0, height: 10 },
                    elevation: 8
                }}
            >
                <Glyph name="checkmark-circle" size={18} color={t.ink} />
                <T w={600} s={12} lh={1.3} c={t.ink} style={{ flexShrink: 1 }}>{toast}</T>
            </View>
        </Animated.View>
    );
}

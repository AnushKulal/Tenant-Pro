// File: mobile/src/redesign/screens/ScanQrScreen.js
// The camera view for scanning a property's invite QR.
//
// IMPORTANT — why expo-camera is required lazily rather than imported:
// it is a NATIVE module, so it only exists in a build compiled after it was
// added to package.json. An over-the-air update ships JavaScript only, so on an
// APK built before that, a top-level `import` would throw at module load and take
// the whole screen down. Requiring it inside a try/catch means an older build
// degrades to typing the code by hand — which still works — and the camera lights
// up by itself once a newer APK is installed. Nothing to change here when it does.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Animated, Easing, Dimensions } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Field } from '../ui';
import { useKeyboardHeight } from '../keyboard';

// Resolved once, at first render, so a missing native module is a state to render
// rather than a crash.
// Resolve the permission function too, not just the view. expo-camera moved it:
// SDK <=50 had `Camera.requestCameraPermissionsAsync`, and from SDK 51 it is a
// TOP-LEVEL export, with `Camera` removed entirely. This screen called the old one,
// so `mod.Camera` was undefined, `.requestCameraPermissionsAsync` threw a TypeError
// inside the mount effect, and the whole tree came down — a blank screen, and
// Android's back button dead because the handler unmounted with it.
//
// Every shape is tried rather than pinning one, so this cannot break again the next
// time the module reorganises.
function loadCamera() {
    try {
        const mod = require('expo-camera');
        if (!mod || !mod.CameraView) return null;
        const ask =
            (typeof mod.requestCameraPermissionsAsync === 'function' && mod.requestCameraPermissionsAsync) ||
            (mod.CameraView && typeof mod.CameraView.requestCameraPermissionsAsync === 'function' && mod.CameraView.requestCameraPermissionsAsync.bind(mod.CameraView)) ||
            (mod.Camera && typeof mod.Camera.requestCameraPermissionsAsync === 'function' && mod.Camera.requestCameraPermissionsAsync.bind(mod.Camera)) ||
            null;
        // No way to ask for permission means no usable camera, whatever else the
        // module exports — fall back to typing the code rather than showing a
        // viewfinder that can never be allowed.
        if (!ask) return null;
        return { CameraView: mod.CameraView, ask };
    } catch (e) {
        return null;
    }
}

// The scan window: a square with four corner brackets and a line that sweeps it.
function Reticle({ size, t }) {
    const sweep = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(sweep, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(sweep, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [sweep]);

    const y = sweep.interpolate({ inputRange: [0, 1], outputRange: [6, size - 6] });
    const corner = { position: 'absolute', width: 30, height: 30, borderColor: t.lime };

    return (
        <View style={{ width: size, height: size }}>
            <View style={[corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 14 }]} />
            <View style={[corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 14 }]} />
            <View style={[corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 14 }]} />
            <View style={[corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 14 }]} />
            <Animated.View
                style={{
                    position: 'absolute',
                    left: 10,
                    right: 10,
                    height: 2,
                    borderRadius: 2,
                    backgroundColor: t.lime,
                    opacity: 0.85,
                    transform: [{ translateY: y }]
                }}
            />
        </View>
    );
}

export default function ScanQrScreen() {
    const vm = useVm();
    const t = useT();
    const scan = vm.scan;
    // 0 when the keyboard is closed, so this costs nothing until somebody types.
    const kb = useKeyboardHeight();

    const [camera] = useState(loadCamera);
    const [granted, setGranted] = useState(null); // null = still asking
    // Guards against the same code firing several times: the camera reports a
    // barcode on every frame it can see one.
    const handled = useRef(false);

    const W = Dimensions.get('window').width;
    const box = Math.min(280, Math.round(W * 0.72));

    // Belt and braces: whatever this call does, it must not be able to take the
    // screen down. A throw in a mount effect propagates and unmounts the tree, which
    // is what produced the blank screen with a dead back button.
    useEffect(() => {
        if (!camera) return undefined;
        let alive = true;
        try {
            Promise.resolve(camera.ask())
                .then((res) => { if (alive) setGranted(!!(res && res.granted)); })
                .catch(() => { if (alive) setGranted(false); });
        } catch (e) {
            setGranted(false);
        }
        return () => { alive = false; };
    }, [camera]);

    const onScanned = useCallback((res) => {
        if (handled.current) return;
        const value = res && (res.data || res.raw);
        if (!value) return;
        handled.current = true;
        scan.found(String(value));
    }, [scan]);

    const Frame = ({ children, note }) => (
        <View style={{ flex: 1, backgroundColor: t.ink, paddingHorizontal: 22, paddingTop: 24 }}>
            <Press
                onPress={scan.close}
                style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', rowGap: 16 }}>
                {children}
            </View>

            {/* Typing the code always works, whatever the camera is doing.
                ...but only if you can SEE it. This block is pinned to the bottom of a
                flex column, so the keyboard opened right on top of it: the tenant
                tapped PROPERTY CODE and the field they were typing into vanished
                behind the keyboard, along with the button that submits it.
                Not a KeyboardScroll, because there is nothing to scroll — the layout
                fills the screen. Lifting the block by the keyboard's own height is
                what a scroll would have amounted to here anyway. */}
            <View style={{ paddingBottom: 26 + kb }}>
                {note}
                {/* Offered on every no-camera path — module missing, permission
                    refused, still asking — because in all three the tenant is holding
                    a phone with the QR already saved on it, and reading it from the
                    gallery is a decode, not a camera. */}
                <Press
                    onPress={scan.fromGallery}
                    style={{ marginBottom: 14, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 }}
                >
                    <Glyph name="image-outline" size={17} color={t.accent} />
                    <T w={600} s={13.5} lh={1} c={t.fg}>Upload QR from photos</T>
                </Press>
                <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>OR ENTER THE CODE</Eyebrow>
                <Field
                    label="PROPERTY CODE"
                    icon="key-outline"
                    value={scan.code}
                    onChangeText={scan.setCode}
                    placeholder="TP-SUN-8412"
                    autoCapitalize="characters"
                    onSubmitEditing={scan.submitCode}
                    returnKeyType="go"
                    style={{ marginBottom: 10 }}
                />
                <Press
                    onPress={scan.submitCode}
                    disabled={!scan.canSubmit}
                    style={{ paddingVertical: 15, borderRadius: 999, backgroundColor: scan.canSubmit ? t.lime : t.ink3, borderWidth: 1, borderColor: scan.canSubmit ? t.lime : t.line, alignItems: 'center' }}
                >
                    <T w={700} s={14} c={scan.canSubmit ? t.on : t.fg3}>Find this property</T>
                </Press>
            </View>
        </View>
    );

    // ── The camera is not in this build ───────────────────────────────────────
    if (!camera) {
        return (
            <Frame
                note={
                    <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 14 }}>
                        <Glyph name="information-circle-outline" size={15} color={t.amber} />
                        <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>
                            Scanning needs a newer version of the app than the one installed. Enter the
                            code below for now — the scanner will appear on its own after the next update.
                        </T>
                    </Row>
                }
            >
                <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="qr-code-outline" size={28} color={t.fg3} />
                </View>
                <T w={700} s={22} lh={1.15} style={{ letterSpacing: -0.8, textAlign: 'center' }}>Enter your invite code</T>
            </Frame>
        );
    }

    // ── Permission refused ────────────────────────────────────────────────────
    if (granted === false) {
        return (
            <Frame
                note={
                    <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.csoft, marginBottom: 14 }}>
                        <Glyph name="alert-circle-outline" size={15} color={t.coral} />
                        <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>
                            TenantPro cannot use the camera. Allow camera access in your phone's settings
                            to scan, or enter the code by hand.
                        </T>
                    </Row>
                }
            >
                <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: t.csoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="videocam-off-outline" size={28} color={t.coral} />
                </View>
                <T w={700} s={22} lh={1.15} style={{ letterSpacing: -0.8, textAlign: 'center' }}>Camera is off</T>
            </Frame>
        );
    }

    // ── Still asking ──────────────────────────────────────────────────────────
    if (granted === null) {
        return (
            <Frame note={null}>
                <Glyph name="camera-outline" size={26} color={t.fg3} />
                <T mono w={600} s={9} ls={0.14} c={t.fg3}>WAITING FOR CAMERA ACCESS</T>
            </Frame>
        );
    }

    const { CameraView } = camera;

    // ── Live scanner ──────────────────────────────────────────────────────────
    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            <CameraView
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                facing="back"
                // Only QR — an invite is a QR, and narrowing it stops a stray barcode
                // on a passing package from being read as a property code.
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onScanned}
            />

            {/* Chrome over the preview. The scrim keeps the white text legible
                against whatever the camera happens to be pointing at. */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,8,0.45)' }} />

            <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 24 }}>
                <Press
                    onPress={scan.close}
                    style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(6,6,8,0.5)', alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="chevron-back" size={19} color="#F4F3F7" />
                </Press>

                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', rowGap: 22 }}>
                    <T w={700} s={22} lh={1.2} c="#F4F3F7" style={{ letterSpacing: -0.8, textAlign: 'center' }}>
                        Point at the invite QR
                    </T>
                    <Reticle size={box} t={t} />
                    <T w={400} s={13} lh={1.5} c="rgba(244,243,247,0.75)" style={{ textAlign: 'center', maxWidth: 280 }}>
                        Your landlord can show it from their app, under Invite a tenant.
                    </T>
                </View>

                {/* Also offered WITH a working camera: a tenant who came here to scan
                    and then remembers the QR is sitting in their WhatsApp should not
                    have to back out and find another button. */}
                <Press
                    onPress={scan.fromGallery}
                    style={{ marginBottom: 9, paddingVertical: 15, borderRadius: 999, backgroundColor: 'rgba(6,6,8,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 }}
                >
                    <Glyph name="image-outline" size={16} color="#F4F3F7" />
                    <T w={600} s={14} c="#F4F3F7">Upload QR from photos</T>
                </Press>

                <Press
                    onPress={scan.typeInstead}
                    style={{ marginBottom: 26, paddingVertical: 15, borderRadius: 999, backgroundColor: 'rgba(6,6,8,0.6)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center' }}
                >
                    <T w={600} s={14} c="#F4F3F7">Enter the code instead</T>
                </Press>
            </View>
        </View>
    );
}

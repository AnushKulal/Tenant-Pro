// File: mobile/src/redesign/docview.js
//
// Looking at somebody's ID, inside the app.
//
// Both document sheets used to hand the file to Linking.openURL, which throws the
// landlord out into Chrome or a gallery app. Three things are wrong with that. The
// obvious one is that it is jarring — you tap "Open" on a bottom sheet and the app
// disappears. The second is that it loses the decision: Verify and Reject are on the
// sheet you just left, so you look at the ID in one app and rule on it in another,
// from memory. The third is the one that actually matters later — a file the phone
// has opened is a file the phone has, in a browser cache or a downloads folder,
// outside anything this app can ever control.
//
// So the image is drawn here instead. An ID card needs zoom — a number printed small
// on a photographed card is unreadable at fit-to-screen — and there is no zoom
// library in this project, so this is built the same way the map's pinch is: RN's
// own PanResponder, plus Animated values set directly so a drag does not re-render
// React on every frame.
//
// PDFs are the honest exception. <Image> cannot draw one and nothing bundled here
// can, so a PDF still goes out to the system viewer — but it says so first, rather
// than silently behaving differently from the file next to it.
import React from 'react';
import { View, Image, Modal, Animated, PanResponder, ActivityIndicator, StatusBar } from 'react-native';
import { useT } from './ThemeContext';
import { T, Eyebrow, Press, Glyph } from './ui';
import { useIdShield, shieldWorks } from './shield';

// Zoom bounds. 1 is fit-to-screen, and there is no reason to go under it: this is a
// viewer, not a canvas, and pinching a document smaller than the screen only ever
// happens by accident. 6 is generous enough to read an Aadhaar number off a photo
// taken from half a metre away.
const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_SCALE = 2.5;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const twoFingerDistance = (touches) => {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy) || 1;
};

export default function DocViewer({ visible, uri, label, status, isPdf, onClose, onOpenOutside }) {
    const t = useT();

    // Somebody's government ID is on screen, full size. While it is, the OS refuses to
    // put the window in a screenshot, a screen recording, or the recent-apps preview —
    // a capture comes out black. Scoped to `visible` so the rest of the app can still
    // be screenshotted normally; see shield.js for why that scoping matters.
    useIdShield(!!visible && !isPdf, 'tenantpro-id-viewer');

    // Animated rather than state: a pinch fires dozens of move events a second, and
    // setState on each one drops frames badly enough to feel broken. setValue on an
    // Animated.Value updates the view without going through React at all.
    const scaleA = React.useRef(new Animated.Value(1)).current;
    const txA = React.useRef(new Animated.Value(0)).current;
    const tyA = React.useRef(new Animated.Value(0)).current;

    // The same numbers as plain values. Animated.Value has no synchronous getter that
    // is safe to rely on, and the gesture maths needs to read where it currently is.
    const view = React.useRef({ scale: 1, tx: 0, ty: 0 });
    const gesture = React.useRef({ startDist: 0, startScale: 1, startTx: 0, startTy: 0, pinching: false });
    const lastTap = React.useRef(0);
    const box = React.useRef({ w: 0, h: 0 });

    const [loading, setLoading] = React.useState(true);
    const [failed, setFailed] = React.useState(false);

    // A pan is only meaningful while zoomed in, and it must not be possible to drag
    // the picture off the screen entirely and be left looking at black. At scale 1
    // the limit is 0, which is what makes a one-finger drag do nothing until you have
    // zoomed — deliberate, because a drag on a fitted image would otherwise slide it
    // away for no reason.
    const limit = (scale) => ({
        x: Math.max(0, (box.current.w * scale - box.current.w) / 2),
        y: Math.max(0, (box.current.h * scale - box.current.h) / 2)
    });

    const apply = ({ scale, tx, ty }) => {
        const lim = limit(scale);
        const next = { scale, tx: clamp(tx, -lim.x, lim.x), ty: clamp(ty, -lim.y, lim.y) };
        view.current = next;
        scaleA.setValue(next.scale);
        txA.setValue(next.tx);
        tyA.setValue(next.ty);
    };

    const reset = (animated = true) => {
        view.current = { scale: 1, tx: 0, ty: 0 };
        if (!animated) {
            scaleA.setValue(1); txA.setValue(0); tyA.setValue(0);
            return;
        }
        // Spring rather than a jump, because a snap-back with no motion reads as the
        // image having been replaced rather than moved.
        Animated.parallel([
            Animated.spring(scaleA, { toValue: 1, useNativeDriver: true, friction: 8 }),
            Animated.spring(txA, { toValue: 0, useNativeDriver: true, friction: 8 }),
            Animated.spring(tyA, { toValue: 0, useNativeDriver: true, friction: 8 })
        ]).start();
    };

    // Opening a different document must not inherit the last one's zoom, and must put
    // the spinner back — otherwise the previous ID sits on screen, at the previous
    // magnification, while the new one downloads.
    React.useEffect(() => {
        reset(false);
        setLoading(!!uri && !isPdf);
        setFailed(false);
    }, [uri, isPdf]);

    const responder = React.useRef(
        PanResponder.create({
            // Claimed on touch-down rather than on movement: a double tap never moves,
            // so waiting for a drag would swallow it.
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: (e) => {
                const now = Date.now();
                const touches = e.nativeEvent.touches;
                gesture.current = {
                    startDist: touches.length > 1 ? twoFingerDistance(touches) : 0,
                    startScale: view.current.scale,
                    startTx: view.current.tx,
                    startTy: view.current.ty,
                    pinching: touches.length > 1
                };
                // Double tap: straight to a readable magnification, and back. The
                // fastest way to read a number on a card, and the gesture everybody
                // already tries first.
                if (touches.length === 1 && now - lastTap.current < 280) {
                    lastTap.current = 0;
                    if (view.current.scale > 1.05) reset();
                    else apply({ scale: TAP_SCALE, tx: 0, ty: 0 });
                    return;
                }
                lastTap.current = touches.length === 1 ? now : 0;
            },
            onPanResponderMove: (e, g) => {
                const touches = e.nativeEvent.touches;
                if (touches.length > 1) {
                    // A pinch that starts as a drag has no recorded start distance, so
                    // it is recorded on the first two-finger frame instead of being
                    // treated as a ratio against zero.
                    if (!gesture.current.pinching || !gesture.current.startDist) {
                        gesture.current = {
                            ...gesture.current,
                            pinching: true,
                            startDist: twoFingerDistance(touches),
                            startScale: view.current.scale,
                            startTx: view.current.tx,
                            startTy: view.current.ty
                        };
                        return;
                    }
                    const ratio = twoFingerDistance(touches) / gesture.current.startDist;
                    const scale = clamp(gesture.current.startScale * ratio, MIN_SCALE, MAX_SCALE);
                    // Centre-anchored, like the map's pinch. Anchoring on the midpoint
                    // is nicer in principle, but a document is read from the middle
                    // outwards and the extra maths is a source of drift.
                    apply({ scale, tx: gesture.current.startTx, ty: gesture.current.startTy });
                    return;
                }
                // One finger, and only once zoomed in — see limit().
                apply({
                    scale: view.current.scale,
                    tx: gesture.current.startTx + g.dx,
                    ty: gesture.current.startTy + g.dy
                });
            },
            onPanResponderRelease: () => {
                gesture.current.pinching = false;
                // Pinching back down to roughly fitted snaps to exactly fitted, so the
                // image cannot be left a few percent off-centre and slightly crooked.
                if (view.current.scale <= 1.05) reset();
            },
            onPanResponderTerminationRequest: () => false
        })
    ).current;

    const transform = [{ translateX: txA }, { translateY: tyA }, { scale: scaleA }];

    return (
        <Modal
            visible={!!visible}
            transparent={false}
            animationType="fade"
            statusBarTranslucent
            // Android's hardware back button. Without this the only way out is the
            // close button, and a full-screen view that swallows Back feels stuck.
            onRequestClose={onClose}
        >
            <StatusBar barStyle="light-content" backgroundColor="#000000" />
            <View style={{ flex: 1, backgroundColor: '#000000' }}>
                {/* Header over the image rather than above it: the picture gets the
                    whole screen, which is the point of a full-screen viewer. */}
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3, paddingTop: 46, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 12 }}>
                        <Press
                            onPress={onClose}
                            style={{ width: 38, height: 38, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' }}
                        >
                            <Glyph name="close" size={19} color="#FFFFFF" />
                        </Press>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={15} lh={1.2} c="#FFFFFF" numberOfLines={1}>{label || 'ID document'}</T>
                            {status ? (
                                <Eyebrow s={9} ls={0.1} c="rgba(255,255,255,0.6)" style={{ marginTop: 3 }}>{status}</Eyebrow>
                            ) : null}
                        </View>
                    </View>
                </View>

                {/* PDFs cannot be drawn by anything bundled here. Saying so and
                    offering the system viewer is more use than a blank black screen
                    that looks like a failed download. */}
                {isPdf ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
                        <Glyph name="document-text-outline" size={54} color="rgba(255,255,255,0.65)" />
                        <T w={600} s={16} lh={1.3} c="#FFFFFF" style={{ marginTop: 18, textAlign: 'center' }}>This one is a PDF</T>
                        <T w={400} s={13} lh={1.55} c="rgba(255,255,255,0.68)" style={{ marginTop: 9, textAlign: 'center' }}>
                            Photos open here in the app. A PDF needs your phone's document viewer, which means leaving TenantPro for a moment.
                        </T>
                        <Press
                            onPress={onOpenOutside}
                            style={{ marginTop: 22, paddingVertical: 14, paddingHorizontal: 26, borderRadius: 999, backgroundColor: t.lime }}
                        >
                            <T w={700} s={14} c={t.on}>Open it anyway</T>
                        </Press>
                    </View>
                ) : !uri ? (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
                        <Glyph name="alert-circle-outline" size={50} color="rgba(255,255,255,0.6)" />
                        <T w={400} s={13.5} lh={1.5} c="rgba(255,255,255,0.7)" style={{ marginTop: 16, textAlign: 'center' }}>
                            There is no file attached to this record.
                        </T>
                    </View>
                ) : (
                    <View
                        style={{ flex: 1 }}
                        onLayout={(e) => { box.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}
                        {...responder.panHandlers}
                    >
                        <Animated.Image
                            source={{ uri }}
                            resizeMode="contain"
                            style={{ width: '100%', height: '100%', transform }}
                            onLoadStart={() => { setLoading(true); setFailed(false); }}
                            onLoad={() => setLoading(false)}
                            // A failed load has to be visible. An <Image> that cannot
                            // fetch renders as nothing at all, which is
                            // indistinguishable from a very slow one on a bad line.
                            onError={() => { setLoading(false); setFailed(true); }}
                            accessibilityLabel={`${label || 'ID document'}, full screen`}
                        />

                        {loading ? (
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                <ActivityIndicator size="large" color="#FFFFFF" />
                            </View>
                        ) : null}

                        {failed ? (
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 }}>
                                <Glyph name="cloud-offline-outline" size={50} color="rgba(255,255,255,0.6)" />
                                <T w={600} s={15} lh={1.3} c="#FFFFFF" style={{ marginTop: 16, textAlign: 'center' }}>That image would not load</T>
                                <T w={400} s={12.5} lh={1.5} c="rgba(255,255,255,0.66)" style={{ marginTop: 8, textAlign: 'center' }}>
                                    Check your connection and try again. If it keeps failing, the file may not have finished uploading.
                                </T>
                                <Press
                                    onPress={onOpenOutside}
                                    style={{ marginTop: 20, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}
                                >
                                    <T w={600} s={13} c="#FFFFFF">Try opening it outside the app</T>
                                </Press>
                            </View>
                        ) : null}

                        {/* Said once, quietly, at the bottom. Pinch is not discoverable
                            on a static picture, and an unreadable ID that could have
                            been zoomed is a verification that does not happen. */}
                        {!loading && !failed ? (
                            <View style={{ position: 'absolute', bottom: 34, left: 0, right: 0, alignItems: 'center', rowGap: 8 }}>
                                <View style={{ paddingVertical: 8, paddingHorizontal: 15, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                                    <T mono w={600} s={9} lh={1} ls={0.08} c="rgba(255,255,255,0.75)">PINCH OR DOUBLE-TAP TO ZOOM</T>
                                </View>
                                {/* Only where it is true. On iOS nothing is prevented —
                                    Apple exposes no way to blank a screenshot — so
                                    claiming protection there would be a promise the
                                    platform cannot keep, made to the person whose ID
                                    it is. */}
                                {shieldWorks ? (
                                    <View style={{ flexDirection: 'row', alignItems: 'center', columnGap: 6, paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                                        <Glyph name="eye-off-outline" size={12} color="rgba(255,255,255,0.75)" />
                                        <T mono w={600} s={8.5} lh={1} ls={0.06} c="rgba(255,255,255,0.72)">SCREENSHOTS OF THIS ID ARE BLOCKED</T>
                                    </View>
                                ) : null}
                            </View>
                        ) : null}
                    </View>
                )}
            </View>
        </Modal>
    );
}

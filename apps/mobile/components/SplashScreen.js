// apps/mobile/components/SplashScreen.js
//
// SentinelPH Citizen App splash screen.
//
// Flow:
//   • Background glow expands from center
//   • Logo drops in from above and scales to 1
//   • Wordmark drops in
//   • Underline draws outward
//   • Subtitle drops in
//   • Three dots drop in one-by-one, then pulse forever
//   • On exit, the whole screen fades out and hands control to the app
//
// Uses the React Native Animated API so it runs on the native thread
// without additional dependencies (no reanimated required).
//
// LAYOUT NOTE
// -----------
// The screen is rendered with position: 'absolute' + inset 0 so it
// covers the entire device including the status bar and notch. The
// inner content is wrapped in a SafeAreaView so the logo, wordmark,
// and dots never collide with the notch or the home indicator. This
// is what mobile users expect from a modern splash.

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const A = '#3b82f6';
const CANVAS = '#06060f';

const { width: SCREEN_W } = Dimensions.get('window');

// Glow diameter: large enough to bleed off-screen on phones, but
// capped so it does not overwhelm tablets.
const GLOW_SIZE = Math.min(SCREEN_W * 2, 720);

// Mobile type scale. The web version used 64px because a desktop
// viewport is wide; on a 390pt-wide phone, 44px reads better and
// leaves room for the subtitle without wrapping.
const WORDMARK_SIZE = 46;
const WORDMARK_LINE = 52;

export default function SplashScreen({ onDone, duration = 2400 }) {
  // Master fade for the whole screen (used on exit)
  const screenOpacity = useRef(new Animated.Value(1)).current;

  // Background glow
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const glowScale = useRef(new Animated.Value(0.3)).current;

  // Logo
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoTranslate = useRef(new Animated.Value(-60)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoPulse = useRef(new Animated.Value(1)).current;

  // Wordmark
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslate = useRef(new Animated.Value(-40)).current;
  const wordmarkScale = useRef(new Animated.Value(0.85)).current;

  // Underline width — animated as 0..1, multiplied by target width
  const underline = useRef(new Animated.Value(0)).current;

  // Subtitle
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslate = useRef(new Animated.Value(-20)).current;

  // Dots — three independent opacities, translates, and pulses
  const dot1 = useRef({
    o: new Animated.Value(0),
    t: new Animated.Value(-14),
    p: new Animated.Value(0.3),
  }).current;
  const dot2 = useRef({
    o: new Animated.Value(0),
    t: new Animated.Value(-14),
    p: new Animated.Value(0.3),
  }).current;
  const dot3 = useRef({
    o: new Animated.Value(0),
    t: new Animated.Value(-14),
    p: new Animated.Value(0.3),
  }).current;

  useEffect(() => {
    // ── Enter sequence ─────────────────────────────────────────────
    Animated.parallel([
      Animated.timing(glowOpacity, {
        toValue: 1,
        duration: 1000,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      Animated.timing(glowScale, {
        toValue: 1,
        duration: 1200,
        easing: Easing.bezier(0.34, 1.3, 0.64, 1),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 500,
          delay: 50,
          useNativeDriver: true,
        }),
        Animated.timing(logoTranslate, {
          toValue: 0,
          duration: 800,
          delay: 50,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
        Animated.timing(logoScale, {
          toValue: 1,
          duration: 800,
          delay: 50,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(wordmarkOpacity, {
          toValue: 1,
          duration: 500,
          delay: 450,
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkTranslate, {
          toValue: 0,
          duration: 750,
          delay: 450,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
        Animated.timing(wordmarkScale, {
          toValue: 1,
          duration: 750,
          delay: 450,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
      ]),
      Animated.timing(underline, {
        toValue: 1,
        duration: 900,
        delay: 950,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 500,
          delay: 1250,
          useNativeDriver: true,
        }),
        Animated.timing(subtitleTranslate, {
          toValue: 0,
          duration: 600,
          delay: 1250,
          easing: Easing.bezier(0.34, 1.56, 0.64, 1),
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.parallel([
          Animated.timing(dot1.o, {
            toValue: 1, duration: 350, delay: 1500, useNativeDriver: true,
          }),
          Animated.timing(dot1.t, {
            toValue: 0, duration: 550, delay: 1500,
            easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(dot2.o, {
            toValue: 1, duration: 350, delay: 1640, useNativeDriver: true,
          }),
          Animated.timing(dot2.t, {
            toValue: 0, duration: 550, delay: 1640,
            easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(dot3.o, {
            toValue: 1, duration: 350, delay: 1780, useNativeDriver: true,
          }),
          Animated.timing(dot3.t, {
            toValue: 0, duration: 550, delay: 1780,
            easing: Easing.bezier(0.34, 1.56, 0.64, 1), useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      // ── Idle loops ───────────────────────────────────────────────
      // Logo pulse
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, {
            toValue: 1.06, duration: 1200,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(logoPulse, {
            toValue: 1, duration: 1200,
            easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ])
      ).start();

      // Dot pulse (staggered)
      const pulse = (dot, delay) => {
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot.p, {
              toValue: 1, duration: 480,
              easing: Easing.inOut(Easing.ease), useNativeDriver: true,
            }),
            Animated.timing(dot.p, {
              toValue: 0.3, duration: 720,
              easing: Easing.inOut(Easing.ease), useNativeDriver: true,
            }),
          ])
        ).start();
      };
      pulse(dot1, 0);
      pulse(dot2, 150);
      pulse(dot3, 300);
    });

    // ── Exit ──────────────────────────────────────────────────────
    const exitTimer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 450,
        easing: Easing.ease,
        useNativeDriver: true,
      }).start(() => {
        onDone?.();
      });
    }, duration);

    return () => clearTimeout(exitTimer);
  }, [
    duration,
    onDone,
    screenOpacity,
    glowOpacity, glowScale,
    logoOpacity, logoTranslate, logoScale, logoPulse,
    wordmarkOpacity, wordmarkTranslate, wordmarkScale,
    underline, subtitleOpacity, subtitleTranslate,
    dot1, dot2, dot3,
  ]);

  const underlineWidth = underline.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 220],
  });

  return (
    <Animated.View style={[styles.screen, { opacity: screenOpacity }]}>
      {/* Background glow — absolutely centered behind everything */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.glow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      {/* Content — wrapped in SafeAreaView so it never collides with
          the notch or the home indicator. Centered both axes. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.centerStack}>
          {/* Logo */}
          <Animated.View
            style={{
              opacity: logoOpacity,
              transform: [
                { translateY: logoTranslate },
                { scale: Animated.multiply(logoScale, logoPulse) },
              ],
            }}
          >
            <Image
              source={require('../assets/LOGO1.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </Animated.View>

          {/* Wordmark + underline + subtitle */}
          <Animated.View
            style={[
              styles.wordmarkBlock,
              {
                opacity: wordmarkOpacity,
                transform: [
                  { translateY: wordmarkTranslate },
                  { scale: wordmarkScale },
                ],
              },
            ]}
          >
            <Text style={styles.wordmarkText} numberOfLines={1}>
              Sentinel
            </Text>

            <Animated.View style={[styles.underline, { width: underlineWidth }]} />

            <Animated.Text
              style={[
                styles.subtitle,
                {
                  opacity: subtitleOpacity,
                  transform: [{ translateY: subtitleTranslate }],
                },
              ]}
              numberOfLines={2}
            >
              CITIZEN PROTECTION
            </Animated.Text>

            <Animated.Text
              style={[
                styles.tagline,
                {
                  opacity: subtitleOpacity,
                  transform: [{ translateY: subtitleTranslate }],
                },
              ]}
              numberOfLines={2}
            >
              Verify messages. Report scams.
            </Animated.Text>
          </Animated.View>

          {/* Dots */}
          <View style={styles.dotsRow}>
            <Animated.View
              style={[
                styles.dot,
                { opacity: dot1.p, transform: [{ translateY: dot1.t }] },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                { opacity: dot2.p, transform: [{ translateY: dot2.t }] },
              ]}
            />
            <Animated.View
              style={[
                styles.dot,
                { opacity: dot3.p, transform: [{ translateY: dot3.t }] },
              ]}
            />
          </View>
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CANVAS,
    zIndex: 10000,
    overflow: 'hidden',
  },
  // Centered absolutely behind the content stack. The `top: '50%'` plus
  // negative margin centers it reliably on every screen size.
  glow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    marginTop: -GLOW_SIZE / 2,
    marginLeft: -GLOW_SIZE / 2,
    borderRadius: GLOW_SIZE / 2,
    backgroundColor: `${A}20`,
    ...Platform.select({
      ios: {
        shadowColor: A,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 100,
      },
      android: {
        // No native blur on Android views. A slightly larger, softer
        // background circle approximates the glow visually.
        backgroundColor: `${A}28`,
      },
    }),
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerStack: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    width: '100%',
  },
  logo: {
    width: 128,
    height: 128,
    marginBottom: 4,
    ...Platform.select({
      ios: {
        shadowColor: A,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 32,
      },
      android: {
        // Shadow on Android is only rendered via elevation, which does
        // not give a colored glow. Accept a slightly dimmer logo.
        elevation: 12,
      },
    }),
  },
  wordmarkBlock: {
    alignItems: 'center',
    width: '100%',
  },
  wordmarkText: {
    fontSize: WORDMARK_SIZE,
    lineHeight: WORDMARK_LINE,
    fontWeight: '800',
    letterSpacing: -1.2,
    color: '#e5e7eb',
    textAlign: 'center',
    fontFamily: 'Inter_700Bold',
  },
  underline: {
    height: 2,
    marginTop: 14,
    backgroundColor: A,
    borderRadius: 2,
    opacity: 0.9,
  },
  subtitle: {
    marginTop: 16,
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 5,
    textAlign: 'center',
    fontFamily: 'JetBrainsMono_500Medium',
    // Letter-spacing adds trailing space; compensate so the text is
    // visually centered inside the SafeAreaView.
    paddingLeft: 5,
  },
  tagline: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '500',
    color: '#4b5563',
    letterSpacing: 0.3,
    textAlign: 'center',
    fontFamily: 'Inter_400Regular',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 40,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: A,
    ...Platform.select({
      ios: {
        shadowColor: A,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.9,
        shadowRadius: 10,
      },
      android: {
        elevation: 4,
      },
    }),
  },
});
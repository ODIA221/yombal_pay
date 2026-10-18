// Composants d'interface : grandes zones tactiles, retours haptiques, contrastes lisibles en plein soleil.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, radius } from '../theme';
import { STATUS } from '../lib/format';

export const tap = () => Platform.OS !== 'web' && Haptics.selectionAsync().catch(() => {});
export const success = () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const warn = () => Platform.OS !== 'web' && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

export function Screen({ children, refreshing, onRefresh, scroll = true, padded = true, style }) {
  const insets = useSafeAreaInsets();
  const content = [{ paddingTop: insets.top + 12, paddingBottom: 32, paddingHorizontal: padded ? 18 : 0 }, style];
  if (!scroll) return <View style={[styles.screen, ...content]}>{children}</View>;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={content}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.btc} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

export const T = {
  Eyebrow: ({ children, style }) => <Text style={[styles.eyebrow, style]}>{children}</Text>,
  Title: ({ children, style }) => <Text style={[styles.title, style]}>{children}</Text>,
  H2: ({ children, style }) => <Text style={[styles.h2, style]}>{children}</Text>,
  Body: ({ children, style, ...p }) => <Text style={[styles.body, style]} {...p}>{children}</Text>,
  Muted: ({ children, style, ...p }) => <Text style={[styles.muted, style]} {...p}>{children}</Text>,
  Mono: ({ children, style, ...p }) => <Text style={[styles.mono, style]} {...p}>{children}</Text>,
};

export function Card({ children, style, onPress, accent }) {
  const body = <View style={[styles.card, accent && { borderColor: accent }, style]}>{children}</View>;
  if (!onPress) return body;
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }]}>
      {body}
    </Pressable>
  );
}

export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, size = 'md', style }) {
  const v = BUTTON[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={off}
      onPress={() => (tap(), onPress?.())}
      style={({ pressed }) => [styles.btn, size === 'lg' && styles.btnLg, size === 'sm' && styles.btnSm, { backgroundColor: v.bg, borderColor: v.border }, off && { opacity: 0.45 }, pressed && { opacity: 0.8 }, style]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={v.fg} />}
          <Text style={[styles.btnText, size === 'lg' && { fontSize: 18 }, size === 'sm' && { fontSize: 14 }, { color: v.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const BUTTON = {
  primary: { bg: colors.btc, fg: colors.onBtc, border: colors.btc },
  ghost: { bg: colors.card, fg: colors.text, border: colors.line2 },
  green: { bg: colors.green, fg: '#06210f', border: colors.green },
  danger: { bg: colors.redSoft, fg: colors.red, border: 'transparent' },
  link: { bg: 'transparent', fg: colors.btc, border: 'transparent' },
};

export function Pill({ status, label, tone }) {
  const s = STATUS[status] || { label: label || status, tone: tone || 'muted' };
  const t = { ok: [colors.greenSoft, colors.green], warn: [colors.amberSoft, colors.amber], bad: [colors.redSoft, colors.red], muted: [colors.card2, colors.muted], btc: [colors.btcSoft, colors.btc] }[tone || s.tone];
  return (
    <View style={[styles.pill, { backgroundColor: t[0] }]}>
      <Text style={[styles.pillText, { color: t[1] }]}>{label || s.label}</Text>
    </View>
  );
}

export function Input({ label, hint, error, suffix, style, ...props }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.input, focus && { borderColor: colors.btc }, error && { borderColor: colors.red }, style]}>
        <TextInput
          placeholderTextColor={colors.muted}
          selectionColor={colors.btc}
          style={styles.inputText}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          {...props}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented}>
      {options.map(([v, l]) => (
        <Pressable key={v} onPress={() => (tap(), onChange(v))} style={[styles.segment, value === v && styles.segmentOn]}>
          <Text style={[styles.segmentText, value === v && { color: colors.text }]}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Row({ icon, iconColor = colors.muted, iconBg = colors.card2, title, subtitle, right, rightSub, onPress, last }) {
  const content = (
    <View style={[styles.row, !last && styles.rowLine]}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {(right || rightSub) && (
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {typeof right === 'string' ? <Text style={styles.rowRight}>{right}</Text> : right}
          {typeof rightSub === 'string' ? <Text style={styles.rowSub}>{rightSub}</Text> : rightSub}
        </View>
      )}
      {onPress && !right && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </View>
  );
  return onPress ? (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

export function Empty({ icon = 'receipt-outline', title, children }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.muted} />
      </View>
      <Text style={styles.h3}>{title}</Text>
      {children ? <Text style={[styles.muted, { textAlign: 'center' }]}>{children}</Text> : null}
    </View>
  );
}

// Feuille qui monte du bas de l'écran (formulaires de retrait, conversion, épargne…)
export function Sheet({ visible, title, onClose, children }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.grabber} />
          <View style={styles.sheetHead}>
            <Text style={styles.h2}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Fermer">
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Banner({ tone = 'ok', icon = 'shield-checkmark', children }) {
  const c = { ok: [colors.greenSoft, colors.green], warn: [colors.amberSoft, colors.amber], bad: [colors.redSoft, colors.red], btc: [colors.btcSoft, colors.btc] }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: c[0] }]}>
      <Ionicons name={icon} size={18} color={c[1]} />
      <Text style={[styles.bannerText, { color: c[1] }]}>{children}</Text>
    </View>
  );
}

export function ErrorText({ children }) {
  if (!children) return null;
  return (
    <View style={styles.errorBox}>
      <Ionicons name="alert-circle" size={18} color={colors.red} />
      <Text style={[styles.error, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
      <ActivityIndicator color={colors.btc} size="large" />
    </View>
  );
}

// Petite pastille qui pulse : « en attente du paiement »
export function LiveDot({ color = colors.amber }) {
  const [a] = useState(() => new Animated.Value(0.4));
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(a, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color, opacity: a }} />;
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  eyebrow: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 28, letterSpacing: -0.6 },
  h2: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 19, letterSpacing: -0.3 },
  h3: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 17 },
  body: { color: colors.text, fontFamily: fonts.body, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  mono: { color: colors.text, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 13 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 18 },
  btn: { minHeight: 52, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnLg: { minHeight: 62, borderRadius: radius.lg },
  btnSm: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.sm },
  btnText: { fontFamily: fonts.bodyBold, fontSize: 16 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 12 },
  label: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  input: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, minHeight: 52 },
  inputText: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 16, paddingHorizontal: 14, paddingVertical: 12 },
  suffix: { color: colors.muted, fontFamily: fonts.bodyBold, paddingHorizontal: 14 },
  hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 13 },
  error: { color: colors.red, fontFamily: fonts.bodyMedium, fontSize: 14 },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.redSoft, borderRadius: radius.sm, padding: 12 },
  segmented: { flexDirection: 'row', backgroundColor: colors.bg2, borderRadius: radius.md, padding: 4, borderWidth: 1, borderColor: colors.line, gap: 4 },
  segment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, paddingHorizontal: 6 },
  segmentOn: { backgroundColor: colors.card2 },
  segmentText: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
  rowRight: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 12 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.card2, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 20, paddingTop: 10, maxHeight: '92%', borderWidth: 1, borderColor: colors.line },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.line2, marginBottom: 10 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: radius.md, padding: 14 },
  bannerText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
});

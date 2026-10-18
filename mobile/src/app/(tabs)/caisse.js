// Caisse : pavé numérique en FCFA, pensé pour être utilisé d'une main, au comptoir.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { fcfa, num } from '../../lib/format';
import { Button, ErrorText, Screen, T, tap, warn } from '../../components/ui';
import { colors, fonts, radius } from '../../theme';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'];
const QUICK = [500, 1000, 2500, 5000, 10000];
const MAX = 5_000_000;

export default function Caisse() {
  const router = useRouter();
  const { merchant } = useAuth();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data: rate } = useLoad(() => api('/v1/rates', { auth: false }), { every: 60000 });

  const value = Number(amount || 0);
  const sats = rate && value ? Math.ceil((value / rate.xof_per_btc) * 1e8) : 0;

  function press(k) {
    tap();
    setError('');
    if (k === 'back') return setAmount((a) => a.slice(0, -1));
    setAmount((a) => {
      const next = (a + k).replace(/^0+/, '');
      return Number(next) > MAX ? a : next;
    });
  }

  async function charge() {
    if (value < 100) {
      warn();
      return setError('Montant minimum : 100 FCFA.');
    }
    setBusy(true);
    setError('');
    try {
      const c = await api('/v1/checkouts', { method: 'POST', body: { amount: value, source: 'pos', description: note.trim() || 'Vente en caisse' } });
      setAmount('');
      setNote('');
      router.push(`/encaisser/${c.id}`);
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false} style={{ flex: 1, gap: 12 }}>
      <View style={st.head}>
        <T.Eyebrow>Caisse{merchant?.staff ? ` · ${merchant.staff.name}` : ''}</T.Eyebrow>
        <Text style={st.shop} numberOfLines={1}>
          {merchant?.name}
        </Text>
      </View>

      <View style={st.display}>
        <Text style={[st.amount, !value && { color: colors.line2 }]} adjustsFontSizeToFit numberOfLines={1}>
          {value ? num(value) : '0'}
          <Text style={st.currency}> FCFA</Text>
        </Text>
        <View style={st.satsRow}>
          <Ionicons name="flash" size={14} color={colors.btc} />
          <Text style={st.sats}>{sats ? `${num(sats)} sats` : 'Converti en Bitcoin au taux du moment'}</Text>
        </View>
      </View>

      <View style={st.quick}>
        {QUICK.map((q) => (
          <Pressable key={q} onPress={() => (tap(), setAmount(String(q)), setError(''))} style={({ pressed }) => [st.chip, pressed && { opacity: 0.7 }]}>
            <Text style={st.chipText}>{num(q)}</Text>
          </Pressable>
        ))}
      </View>

      <TextInput value={note} onChangeText={setNote} placeholder="Motif (facultatif) : boubou, retouche…" placeholderTextColor={colors.muted} style={st.note} maxLength={80} selectionColor={colors.btc} />

      <View style={st.pad}>
        {[0, 1, 2, 3].map((r) => (
          <View key={r} style={st.padRow}>
            {KEYS.slice(r * 3, r * 3 + 3).map((k) => (
              <Pressable key={k} onPress={() => press(k)} onLongPress={() => k === 'back' && (tap(), setAmount(''))} style={({ pressed }) => [st.key, pressed && st.keyDown]} accessibilityLabel={k === 'back' ? 'Effacer' : k}>
                {k === 'back' ? <Ionicons name="backspace-outline" size={28} color={colors.text} /> : <Text style={st.keyText}>{k}</Text>}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      <ErrorText>{error}</ErrorText>
      <Button title={value ? `Encaisser ${fcfa(value)}` : 'Encaisser'} icon="qr-code" size="lg" onPress={charge} loading={busy} disabled={!value} />
    </Screen>
  );
}

const st = StyleSheet.create({
  head: { gap: 2 },
  shop: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 18 },
  display: { alignItems: 'center', paddingVertical: 10, gap: 6 },
  amount: { color: colors.text, fontFamily: fonts.display, fontSize: 56, letterSpacing: -2 },
  currency: { fontSize: 22, color: colors.muted, letterSpacing: 0 },
  satsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sats: { color: colors.btc, fontFamily: fonts.bodyBold, fontSize: 14 },
  quick: { flexDirection: 'row', gap: 8, justifyContent: 'center', flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  chipText: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  note: { backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  pad: { flex: 1, gap: 8, minHeight: 220 },
  padRow: { flex: 1, flexDirection: 'row', gap: 8 },
  key: { flex: 1, minHeight: 48, borderRadius: radius.md, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  keyDown: { backgroundColor: colors.card2, transform: [{ scale: 0.97 }] },
  keyText: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 28 },
});

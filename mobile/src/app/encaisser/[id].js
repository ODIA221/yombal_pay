// Encaissement en plein écran : le client scanne le QR (Lightning ou USDT), l'écran passe au vert dès que
// le serveur confirme le paiement (webhook Bitnob signé), avec une vibration de succès.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { api, webUrl } from '../../lib/api';
import { fcfa, num } from '../../lib/format';
import { Button, ErrorText, LiveDot, Loading, Segmented, success, tap } from '../../components/ui';
import { CHAINS, colors, fonts, radius } from '../../theme';

function useCountdown(iso) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = iso ? Math.max(0, Math.floor((Date.parse(iso) - now) / 1000)) : 0;
  return { left, label: `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` };
}

export default function Charge() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [method, setMethod] = useState('ln');
  const [chainBusy, setChainBusy] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [copied, setCopied] = useState(false);
  const paidOnce = useRef(false);
  const { left, label } = useCountdown(c?.expires_at);

  const load = useCallback(async () => {
    try {
      const d = await api(`/v1/checkouts/${id}`);
      setC(d);
      if (d.status === 'paid' && !paidOnce.current) {
        paidOnce.current = true;
        success();
      }
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  // Vérification serveur toutes les 2 s tant que le paiement est en attente
  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(() => !paidOnce.current && load(), 2000);
    return () => (clearTimeout(first), clearInterval(t));
  }, [load]);

  async function chooseChain(chain) {
    if (c.usdt.addresses.some((a) => a.chain === chain)) return;
    setChainBusy(true);
    setError('');
    try {
      setC(await api(`/v1/checkouts/${id}/usdt`, { method: 'POST', body: { chain } }));
    } catch (e) {
      setError(e.message);
    } finally {
      setChainBusy(false);
    }
  }

  async function simulate() {
    setSimulating(true);
    try {
      await api(`/v1/checkouts/${id}/simulate-payment`, { method: 'POST', body: method === 'usdt' ? { asset: 'USDT' } : {} });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSimulating(false);
    }
  }

  async function copy(text) {
    await Clipboard.setStringAsync(text);
    tap();
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!c) return error ? <View style={[st.root, { padding: 24, paddingTop: insets.top + 24 }]}><ErrorText>{error}</ErrorText><Button title="Retour" variant="ghost" onPress={() => router.back()} /></View> : <Loading />;
  if (c.status === 'paid') return <Paid c={c} onDone={() => router.back()} insets={insets} />;

  const usdtStarted = c.usdt?.addresses?.length > 0;
  const expired = !usdtStarted && (c.status === 'expired' || left === 0);
  const address = c.usdt?.addresses?.at(-1);
  const lightning = `lightning:${c.payment_request}`.toUpperCase();

  return (
    <View style={[st.root, { paddingTop: insets.top + 8 }]}>
      <View style={st.top}>
        <Pressable onPress={() => (tap(), router.back())} hitSlop={12} style={st.close} accessibilityLabel="Annuler">
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        {c.demo && <Text style={st.demo}>Mode démo</Text>}
      </View>

      <ScrollView contentContainerStyle={[st.body, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={st.amount} adjustsFontSizeToFit numberOfLines={1}>
          {fcfa(c.amount)}
        </Text>
        <Text style={st.sub}>
          {method === 'usdt' ? `₮ ${c.usdt.amount} USDT` : `⚡ ${num(c.amount_sats)} sats`}
          {c.description ? `  ·  ${c.description}` : ''}
        </Text>

        {expired ? (
          <View style={st.expired}>
            <Ionicons name="time-outline" size={40} color={colors.muted} />
            <Text style={st.h}>Facture expirée</Text>
            <Text style={st.mutedC}>Le taux n’est plus garanti. Relancez l’encaissement.</Text>
            <Button title="Nouvel encaissement" onPress={() => router.back()} style={{ alignSelf: 'stretch' }} />
          </View>
        ) : (
          <>
            {c.usdt?.available && (
              <View style={{ alignSelf: 'stretch' }}>
                <Segmented value={method} onChange={setMethod} options={[['ln', '⚡ Bitcoin Lightning'], ['usdt', '₮ USDT / USDC']]} />
              </View>
            )}

            {method === 'ln' ? (
              <>
                <View style={st.qr}>
                  <QRCode value={lightning} size={240} backgroundColor="#fff" color="#0e0f13" />
                </View>
                <View style={st.wait}>
                  <LiveDot />
                  <Text style={st.waitText}>En attente du paiement</Text>
                  <Text style={st.timer}>{label}</Text>
                </View>
                <View style={st.row2}>
                  <Button title={copied ? 'Copiée' : 'Copier la facture'} icon={copied ? 'checkmark' : 'copy-outline'} variant="ghost" size="sm" onPress={() => copy(c.payment_request)} style={{ flex: 1 }} />
                  <Button title="Envoyer le lien" icon="share-outline" variant="ghost" size="sm" onPress={() => Share.share({ message: `Payez ${fcfa(c.amount)} à ${c.merchant?.name} : ${webUrl(`/pay/${c.id}`)}` })} style={{ flex: 1 }} />
                </View>
              </>
            ) : (
              <View style={{ alignSelf: 'stretch', gap: 12 }}>
                <Text style={st.label}>Réseau du client</Text>
                <View style={st.chains}>
                  {c.usdt.chains.map((ch) => {
                    const on = address?.chain === ch;
                    return (
                      <Pressable key={ch} disabled={chainBusy} onPress={() => (tap(), chooseChain(ch))} style={[st.chain, on && st.chainOn]}>
                        <Text style={[st.chainText, on && { color: colors.green }]}>{CHAINS[ch] || ch}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {address ? (
                  <>
                    <View style={[st.qr, { alignSelf: 'center' }]}>
                      <QRCode value={address.address} size={220} backgroundColor="#fff" color="#0e0f13" />
                    </View>
                    <Text style={st.usdtAmount}>
                      Envoyez exactement <Text style={{ color: colors.green }}>{c.usdt.amount} USDT</Text>
                    </Text>
                    <Pressable onPress={() => copy(address.address)}>
                      <Text style={st.address}>{address.address}</Text>
                    </Pressable>
                    {c.usdt.received && <Text style={st.partial}>Reçu : {c.usdt.received} sur {c.usdt.amount} USDT</Text>}
                    <Text style={st.warnText}>Uniquement sur le réseau {CHAINS[address.chain] || address.chain}. Un envoi sur un autre réseau serait perdu.</Text>
                    <View style={st.wait}>
                      <LiveDot />
                      <Text style={st.waitText}>En attente de la blockchain</Text>
                    </View>
                  </>
                ) : (
                  <Text style={st.mutedC}>{chainBusy ? 'Création de l’adresse…' : 'Choisissez le réseau utilisé par le client.'}</Text>
                )}
              </View>
            )}

            <ErrorText>{error}</ErrorText>
            {c.demo && (method === 'ln' || address) && (
              <Button title={simulating ? 'Envoi du webhook…' : 'Simuler le paiement (démo)'} variant="ghost" icon="flask-outline" onPress={simulate} loading={simulating} style={{ alignSelf: 'stretch', borderStyle: 'dashed', borderColor: colors.amber }} />
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Paid({ c, onDone, insets }) {
  const [scale] = useState(() => new Animated.Value(0.3));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  }, [scale]);
  const receipt = webUrl(`/recu/${c.id}`);
  return (
    <View style={[st.root, st.paid, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Animated.View style={[st.check, { transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={84} color="#06210f" />
        </Animated.View>
        <Text style={st.paidTitle}>Paiement reçu</Text>
        <Text style={st.paidAmount} adjustsFontSizeToFit numberOfLines={1}>
          {fcfa(c.amount)}
        </Text>
        <Text style={st.mutedC}>{c.pay_asset === 'USDT' ? `${c.usdt.received} USDT crédités, sans volatilité` : `${num(c.amount_sats)} sats crédités sur votre solde`}</Text>
        {c.savings?.xof > 0 && <Text style={st.saved}>Votre client a évité {fcfa(c.savings.xof)} de frais</Text>}
      </View>
      <View style={{ gap: 10 }}>
        <View style={st.row2}>
          <Button title="Voir le reçu" icon="document-text-outline" variant="ghost" onPress={() => Linking.openURL(receipt)} style={{ flex: 1 }} />
          <Button title="Envoyer" icon="share-outline" variant="ghost" onPress={() => Share.share({ message: `Votre reçu ${c.merchant?.name} : ${fcfa(c.amount)}\n${receipt}` })} style={{ flex: 1 }} />
        </View>
        <Button title="Nouvelle vente" icon="add" size="lg" onPress={onDone} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  demo: { color: colors.amber, fontFamily: fonts.bodyBold, fontSize: 13, backgroundColor: colors.amberSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, overflow: 'hidden' },
  body: { alignItems: 'center', gap: 16, paddingHorizontal: 22, paddingTop: 8 },
  amount: { color: colors.text, fontFamily: fonts.display, fontSize: 46, letterSpacing: -1.5 },
  sub: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 15, marginTop: -8, textAlign: 'center' },
  qr: { padding: 16, backgroundColor: '#fff', borderRadius: radius.lg },
  wait: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  waitText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 15 },
  timer: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 15, marginLeft: 6 },
  row2: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  label: { color: colors.muted, fontFamily: fonts.bodyBold, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  chains: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chain: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 99, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.card },
  chainOn: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  chainText: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  usdtAmount: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 16, textAlign: 'center' },
  address: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, textAlign: 'center' },
  partial: { color: colors.green, fontFamily: fonts.bodyBold, textAlign: 'center' },
  warnText: { color: colors.amber, backgroundColor: colors.amberSoft, padding: 12, borderRadius: radius.sm, fontFamily: fonts.bodyMedium, fontSize: 13, overflow: 'hidden' },
  expired: { alignItems: 'center', gap: 10, paddingVertical: 30, alignSelf: 'stretch' },
  h: { color: colors.text, fontFamily: fonts.displayMedium, fontSize: 22 },
  mutedC: { color: colors.muted, fontFamily: fonts.body, fontSize: 15, textAlign: 'center' },
  paid: { paddingHorizontal: 22, backgroundColor: '#07170d' },
  check: { width: 140, height: 140, borderRadius: 70, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  paidTitle: { color: colors.green, fontFamily: fonts.displayMedium, fontSize: 22 },
  paidAmount: { color: colors.text, fontFamily: fonts.display, fontSize: 50, letterSpacing: -1.5 },
  saved: { color: colors.green, fontFamily: fonts.bodyBold, fontSize: 14, backgroundColor: colors.greenSoft, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, overflow: 'hidden' },
});

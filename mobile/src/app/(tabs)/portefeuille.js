// Portefeuille : soldes BTC / USDT, retrait vers mobile money (mot de passe exigé), protection en USDT,
// historique des retraits et état du rapprochement comptable.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { dateTime, fcfa, num, snPhone, usdt } from '../../lib/format';
import { Banner, Button, Card, Empty, ErrorText, Input, Loading, Pill, Row, Screen, Segmented, Sheet, T, success, tap, warn } from '../../components/ui';
import { colors, fonts, NETWORKS, radius } from '../../theme';

export default function Wallet() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { merchant } = useAuth();
  const [local, setLocal] = useState(null);
  // Ouverture directe depuis l'accueil (« Retirer », « Protéger ») : déduite des paramètres de navigation
  const sheet = local || { retrait: 'payout', convertir: 'convert' }[params.action] || null;
  const setSheet = (v) => {
    setLocal(v);
    if (!v && params.action) router.setParams({ action: undefined });
  };
  const { data, error, refreshing, refresh, reload } = useLoad(
    async () => {
      const [overview, payouts, corridor, rec] = await Promise.all([
        api('/v1/overview'),
        api('/v1/payouts'),
        api('/v1/payouts/corridor'),
        api('/v1/reconciliation').catch(() => null),
      ]);
      return { overview, payouts, corridor, rec };
    },
    { every: 8000 },
  );

  if (!data) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const b = data.overview.balance;
  const done = () => (setSheet(null), reload());

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <T.Eyebrow>Portefeuille</T.Eyebrow>
      <T.Title>{fcfa(b.total_xof)}</T.Title>
      <T.Muted>Solde disponible · 1 BTC = {fcfa(b.rate.xof_per_btc)}</T.Muted>

      <View style={st.assets}>
        <Card style={st.asset}>
          <View style={[st.assetIcon, { backgroundColor: colors.btcSoft }]}>
            <Ionicons name="flash" size={18} color={colors.btc} />
          </View>
          <Text style={st.assetLabel}>Bitcoin</Text>
          <Text style={st.assetValue}>{num(b.btc.sats)} sats</Text>
          <Text style={st.assetSub}>≈ {fcfa(b.btc.xof)}</Text>
        </Card>
        <Card style={st.asset}>
          <View style={[st.assetIcon, { backgroundColor: 'rgba(38,161,123,0.15)' }]}>
            <Text style={{ color: colors.teal, fontFamily: fonts.bodyBold, fontSize: 16 }}>₮</Text>
          </View>
          <Text style={st.assetLabel}>Dollars stables</Text>
          <Text style={st.assetValue}>{usdt(b.usdt.amount)}</Text>
          <Text style={st.assetSub}>≈ {fcfa(b.usdt.xof)}</Text>
        </Card>
      </View>

      <View style={{ gap: 10, marginTop: 14 }}>
        <Button title="Retirer vers mobile money" icon="arrow-up" size="lg" onPress={() => setSheet('payout')} />
        <Button title="Protéger en USDT" icon="shield-checkmark-outline" variant="ghost" onPress={() => setSheet('convert')} />
      </View>

      {!data.corridor.available && (
        <View style={{ marginTop: 12 }}>
          <Banner tone="warn" icon="alert-circle-outline">{data.corridor.message}</Banner>
        </View>
      )}

      {data.rec && (
        <Card style={{ marginTop: 16 }} onPress={() => router.push('/rapprochement')} accent={data.rec.ok ? undefined : colors.red}>
          <View style={st.recRow}>
            <Ionicons name={data.rec.ok ? 'checkmark-circle' : 'alert-circle'} size={26} color={data.rec.ok ? colors.green : colors.red} />
            <View style={{ flex: 1 }}>
              <Text style={st.recTitle}>{data.rec.ok ? 'Comptes rapprochés : aucun écart' : `${data.rec.errors} écart${data.rec.errors > 1 ? 's' : ''} à examiner`}</Text>
              <Text style={st.assetSub}>
                {data.rec.checked.payments} paiements, {data.rec.checked.payouts} retraits, {data.rec.checked.conversions} conversions vérifiés
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </View>
        </Card>
      )}

      <Card style={{ marginTop: 16, paddingVertical: 6 }}>
        <View style={{ paddingTop: 12, paddingBottom: 4 }}>
          <T.H2>Retraits</T.H2>
        </View>
        {data.payouts.data.length === 0 ? (
          <Empty icon="arrow-up-circle-outline" title="Aucun retrait">
            Vos retraits vers Wave, Orange Money, Free Money ou Expresso apparaîtront ici.
          </Empty>
        ) : (
          data.payouts.data.slice(0, 15).map((p, i, a) => {
            const net = NETWORKS.find((n) => n.id === p.network);
            return (
              <Row
                key={p.id}
                last={i === a.length - 1}
                icon="arrow-up"
                iconColor="#fff"
                iconBg={net?.color || colors.card2}
                title={`${p.network_label} · ${p.phone}`}
                subtitle={`${dateTime(p.created_at)}${p.provider === 'simulated' ? ' · simulé' : ''}${p.trigger === 'auto' ? ' · automatique' : ''}`}
                right={fcfa(p.amount)}
                rightSub={<Pill status={p.status} />}
              />
            );
          })
        )}
      </Card>

      <PayoutSheet visible={sheet === 'payout'} onClose={() => setSheet(null)} onDone={done} balance={b} merchant={merchant} />
      <ConvertSheet visible={sheet === 'convert'} onClose={() => setSheet(null)} onDone={done} balance={b} />
    </Screen>
  );
}

function PayoutSheet({ visible, onClose, onDone, balance, merchant }) {
  const def = merchant?.payout;
  const [f, setF] = useState({ amount: '', network: def?.network || 'wave', phone: snPhone(def?.phone || ''), name: def?.name || merchant?.name || '', source: 'BTC', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const available = f.source === 'BTC' ? balance.btc.xof : balance.usdt.xof;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api('/v1/payouts', { method: 'POST', body: { amount: Number(f.amount), network: f.network, phone: f.phone, account_name: f.name, source_asset: f.source, password: f.password } });
      success();
      setF((x) => ({ ...x, amount: '', password: '' }));
      onDone();
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Retirer vers mobile money" onClose={onClose}>
      <View style={st.nets}>
        {NETWORKS.map((n) => (
          <Pressable key={n.id} onPress={() => (tap(), set('network')(n.id))} style={[st.net, f.network === n.id && { borderColor: n.color, backgroundColor: `${n.color}22` }]}>
            <View style={[st.netDot, { backgroundColor: n.color }]} />
            <Text style={st.netText}>{n.label}</Text>
          </Pressable>
        ))}
      </View>
      <Segmented value={f.source} onChange={set('source')} options={[['BTC', `Depuis le Bitcoin`], ['USDT', 'Depuis les USDT']]} />
      <Input label="Montant à recevoir" value={f.amount} onChangeText={set('amount')} keyboardType="number-pad" placeholder="2 000" suffix="FCFA" hint={`Disponible : ${fcfa(available)} · de 500 à 200 000 FCFA par retrait`} />
      <Input label="Numéro" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="77 123 45 67" hint="Numéro sénégalais, avec ou sans +221" />
      <Input label="Nom du titulaire" value={f.name} onChangeText={set('name')} placeholder="Aïssatou Ndiaye" />
      <Input label="Code de retrait ou mot de passe" value={f.password} onChangeText={set('password')} secureTextEntry keyboardType={merchant?.has_payout_pin ? 'number-pad' : 'default'} placeholder="Chaque retrait doit être confirmé" />
      <ErrorText>{error}</ErrorText>
      <Button title={f.amount ? `Retirer ${fcfa(Number(f.amount))}` : 'Retirer'} icon="arrow-up" size="lg" onPress={submit} loading={busy} disabled={!f.amount || !f.phone || !f.password} />
    </Sheet>
  );
}

function ConvertSheet({ visible, onClose, onDone, balance }) {
  const [pct, setPct] = useState('50');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sats = Math.floor((balance.btc.sats * Number(pct)) / 100);
  const xof = Math.round((balance.btc.xof * Number(pct)) / 100);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api('/v1/conversions', { method: 'POST', body: { sats } });
      success();
      onDone();
    } catch (e) {
      warn();
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} title="Protéger en USDT" onClose={onClose}>
      <T.Muted>Le Bitcoin bouge, l’USDT reste stable (≈ 1 $). La conversion passe par le trading Bitnob, au prix coté.</T.Muted>
      <Segmented value={pct} onChange={setPct} options={[['25', '25 %'], ['50', '50 %'], ['75', '75 %'], ['100', '100 %']]} />
      <View style={st.preview}>
        <View style={{ flex: 1 }}>
          <Text style={st.assetSub}>Vous convertissez</Text>
          <Text style={st.assetValue}>{num(sats)} sats</Text>
          <Text style={st.assetSub}>≈ {fcfa(xof)}</Text>
        </View>
        <Ionicons name="arrow-forward" size={20} color={colors.muted} />
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={st.assetSub}>Vous recevez environ</Text>
          <Text style={[st.assetValue, { color: colors.green }]}>{usdt(xof / balance.rate.usd_xof)}</Text>
          <Text style={st.assetSub}>prix final confirmé par Bitnob</Text>
        </View>
      </View>
      {sats < 1000 && <Banner tone="warn" icon="alert-circle-outline">{balance.btc.sats < 1000 ? 'Solde Bitcoin insuffisant : il faut au moins 1 000 sats pour convertir. En mode réel, seul l’argent réellement reçu compte (les ventes de démonstration sont exclues) : encaissez d’abord un paiement.' : 'Moins de 1 000 sats avec ce pourcentage : choisissez-en un plus élevé.'}</Banner>}
      <ErrorText>{error}</ErrorText>
      <Button title="Convertir maintenant" icon="shield-checkmark" size="lg" onPress={submit} loading={busy} disabled={sats < 1000} />
    </Sheet>
  );
}

const st = StyleSheet.create({
  assets: { flexDirection: 'row', gap: 12, marginTop: 16 },
  asset: { flex: 1, gap: 4, padding: 16 },
  assetIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  assetLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  assetValue: { color: colors.text, fontFamily: fonts.display, fontSize: 18 },
  assetSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  recTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  nets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  net: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line2, backgroundColor: colors.bg2, width: '48.5%' },
  netDot: { width: 12, height: 12, borderRadius: 6 },
  netText: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14 },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bg2, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.line },
});

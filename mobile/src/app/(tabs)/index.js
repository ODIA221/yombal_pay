// Accueil : solde en FCFA, actions rapides, ventes du jour, frais évités par les clients, derniers paiements.
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { fcfa, num, SOURCE, timeAgo, usdt } from '../../lib/format';
import { Banner, Card, Empty, ErrorText, Loading, Pill, Row, Screen, T, tap } from '../../components/ui';
import { colors, fonts, radius } from '../../theme';

export default function Home() {
  const { merchant } = useAuth();
  const router = useRouter();
  const { data, error, refreshing, refresh } = useLoad(() => api('/v1/overview'), { every: 10000 });

  if (merchant?.staff) return <Redirect href="/caisse" />;
  if (!data) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;
  const { balance: b, stats: s, recent } = data;
  const hour = new Date().getHours();

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <View style={st.head}>
        <Image source={require('../../../assets/logo-mark-dark.png')} style={st.mark} accessibilityLabel="YombalPay" />
        <View style={{ flex: 1 }}>
          <T.Eyebrow>{hour < 18 ? 'Bonjour' : 'Bonsoir'}</T.Eyebrow>
          <T.Title numberOfLines={1}>{data.merchant.name}</T.Title>
        </View>
        {data.merchant.mode === 'demo' && <Pill label="Démo" tone="warn" />}
      </View>

      <View style={st.balance}>
        <Text style={st.balanceLabel}>Solde disponible</Text>
        <Text style={st.balanceValue} adjustsFontSizeToFit numberOfLines={1}>
          {fcfa(b.total_xof)}
        </Text>
        <View style={st.split}>
          <View style={st.splitItem}>
            <Ionicons name="flash" size={14} color={colors.btc} />
            <Text style={st.splitText}>{num(b.btc.sats)} sats</Text>
          </View>
          <View style={st.splitItem}>
            <View style={st.tether}>
              <Text style={st.tetherText}>₮</Text>
            </View>
            <Text style={st.splitText}>{usdt(b.usdt.amount)}</Text>
          </View>
        </View>
        {b.savings?.micro > 0 && (
          <Pressable onPress={() => (tap(), router.push('/epargne'))} style={st.savingsLink}>
            <Ionicons name="lock-closed" size={13} color={colors.green} />
            <Text style={st.savingsText}>Épargne : {fcfa(b.savings.xof)}</Text>
          </Pressable>
        )}
      </View>

      <View style={st.actions}>
        <Action icon="calculator" label="Encaisser" primary onPress={() => router.push('/caisse')} />
        <Action icon="arrow-up" label="Retirer" onPress={() => router.push({ pathname: '/portefeuille', params: { action: 'retrait' } })} />
        <Action icon="shield-checkmark" label="Protéger" onPress={() => router.push({ pathname: '/portefeuille', params: { action: 'convertir' } })} />
        <Action icon="lock-closed" label="Épargner" onPress={() => router.push('/epargne')} />
      </View>

      <View style={st.stats}>
        <Stat label="Aujourd'hui" value={fcfa(s.today_xof)} sub={`${s.today_count} vente${s.today_count > 1 ? 's' : ''}`} />
        <Stat label="Total encaissé" value={fcfa(s.total_xof)} sub={`${s.paid_count} paiements`} />
      </View>

      {s.savings_xof > 0 && (
        <View style={{ marginTop: 12 }}>
          <Banner icon="sparkles">
            Vos clients ont évité {fcfa(s.savings_xof)} de frais par rapport à un transfert classique.
          </Banner>
        </View>
      )}

      <Card style={{ marginTop: 16, paddingVertical: 6 }}>
        <View style={st.cardHead}>
          <T.H2>Derniers paiements</T.H2>
          <Pressable onPress={() => (tap(), router.push('/paiements'))} hitSlop={10}>
            <Text style={st.link}>Tout voir</Text>
          </Pressable>
        </View>
        {recent.length === 0 ? (
          <Empty icon="calculator-outline" title="Aucun paiement pour l'instant">
            Ouvrez la caisse pour encaisser votre première vente.
          </Empty>
        ) : (
          recent.slice(0, 6).map((c, i, a) => (
            <Row
              key={c.id}
              last={i === a.length - 1}
              icon={c.status === 'paid' ? 'arrow-down' : 'time-outline'}
              iconColor={c.status === 'paid' ? colors.green : colors.amber}
              iconBg={c.status === 'paid' ? colors.greenSoft : colors.amberSoft}
              title={c.description}
              subtitle={`${SOURCE[c.source] || c.source} · ${timeAgo(c.paid_at || c.created_at)}`}
              right={fcfa(c.amount)}
              rightSub={<Pill status={c.status} />}
              onPress={() => router.push(`/paiement/${c.id}`)}
            />
          ))
        )}
      </Card>
    </Screen>
  );
}

function Action({ icon, label, onPress, primary }) {
  return (
    <Pressable onPress={() => (tap(), onPress())} style={({ pressed }) => [st.action, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <View style={[st.actionIcon, primary && { backgroundColor: colors.btc }]}>
        <Ionicons name={icon} size={22} color={primary ? colors.onBtc : colors.text} />
      </View>
      <Text style={st.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function Stat({ label, value, sub }) {
  return (
    <View style={st.stat}>
      <Text style={st.statLabel}>{label}</Text>
      <Text style={st.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={st.statSub}>{sub}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  mark: { width: 44, height: 44 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  balance: { borderRadius: radius.xl, padding: 22, backgroundColor: '#1c1710', borderWidth: 1, borderColor: 'rgba(247,147,26,0.35)', gap: 6 },
  balanceLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 14 },
  balanceValue: { color: colors.text, fontFamily: fonts.display, fontSize: 42, letterSpacing: -1.2 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 6 },
  splitItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  splitText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
  tether: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  tetherText: { color: '#fff', fontSize: 10, fontFamily: fonts.bodyBold },
  savingsLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, alignSelf: 'flex-start', backgroundColor: colors.greenSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  savingsText: { color: colors.green, fontFamily: fonts.bodyBold, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  action: { alignItems: 'center', gap: 8, width: '24%' },
  actionIcon: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.card2, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  actionLabel: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 13 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 18 },
  stat: { flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 16, gap: 2 },
  statLabel: { color: colors.muted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  statValue: { color: colors.text, fontFamily: fonts.display, fontSize: 20 },
  statSub: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, paddingBottom: 4 },
  link: { color: colors.btc, fontFamily: fonts.bodyBold, fontSize: 14 },
});

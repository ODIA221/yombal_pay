// Liste des paiements (ou des ventes du caissier), filtrable, avec recherche.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/useLoad';
import { fcfa, SOURCE, timeAgo } from '../../lib/format';
import { Card, Empty, ErrorText, Loading, Pill, Row, Screen, Segmented, T } from '../../components/ui';
import { colors, fonts, radius } from '../../theme';

export default function Payments() {
  const router = useRouter();
  const { merchant } = useAuth();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const { data, error, refreshing, refresh, reload } = useLoad(
    () => api(`/v1/checkouts?limit=60${status ? `&status=${status}` : ''}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ''}`),
    { every: 15000 },
  );
  // Rechargement quand le filtre ou la recherche change (petit délai pendant la frappe)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return void (first.current = false);
    const t = setTimeout(reload, 300);
    return () => clearTimeout(t);
  }, [status, q, reload]);

  const list = data?.data ?? [];
  const paidTotal = list.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <T.Eyebrow>{merchant?.staff ? 'Mes ventes' : 'Paiements'}</T.Eyebrow>
      <T.Title>{fcfa(paidTotal)}</T.Title>
      <T.Muted style={{ marginBottom: 14 }}>encaissés sur les {list.length} derniers paiements affichés</T.Muted>

      <View style={st.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Rechercher : référence, motif…" placeholderTextColor={colors.muted} style={st.searchInput} returnKeyType="search" selectionColor={colors.btc} />
      </View>
      <View style={{ marginVertical: 12 }}>
        <Segmented value={status} onChange={setStatus} options={[['', 'Tous'], ['paid', 'Payés'], ['pending', 'En attente'], ['expired', 'Expirés']]} />
      </View>

      <ErrorText>{error}</ErrorText>
      {!data ? (
        <Loading />
      ) : list.length === 0 ? (
        <Empty icon="receipt-outline" title="Aucun paiement">
          {status || q ? 'Aucun résultat pour ce filtre.' : 'Vos encaissements apparaîtront ici.'}
        </Empty>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {list.map((c, i) => (
            <Row
              key={c.id}
              last={i === list.length - 1}
              icon={c.pay_asset === 'USDT' ? 'logo-usd' : c.status === 'paid' ? 'flash' : 'time-outline'}
              iconColor={c.status === 'paid' ? (c.pay_asset === 'USDT' ? colors.teal : colors.btc) : colors.muted}
              iconBg={c.status === 'paid' ? (c.pay_asset === 'USDT' ? 'rgba(38,161,123,0.15)' : colors.btcSoft) : colors.card2}
              title={c.description}
              subtitle={`${SOURCE[c.source] || c.source} · ${timeAgo(c.paid_at || c.created_at)}`}
              right={fcfa(c.amount)}
              rightSub={<Pill status={c.status} />}
              onPress={() => router.push(`/paiement/${c.id}`)}
            />
          ))}
        </Card>
      )}
    </Screen>
  );
}

const st = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg2, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 14 },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.body, fontSize: 15, paddingVertical: 12 },
});

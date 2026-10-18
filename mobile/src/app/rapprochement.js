// Rapprochement comptable : chaque paiement, dépôt, retrait et conversion comparé au registre.
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { dateTime } from '../lib/format';
import { Button, Card, ErrorText, Loading, Screen, T } from '../components/ui';
import { colors, fonts, radius } from '../theme';

const CHECKS = [
  ['payments', 'paiements Lightning', 'crédit et commission au bon montant, uniquement si payé'],
  ['deposits', 'dépôts USDT', 'chaque dépôt crédité une seule fois'],
  ['payouts', 'retraits', 'débit exact, remboursement si et seulement si échec'],
  ['conversions', 'conversions', 'sortie BTC et entrée USDT aux montants convertis'],
];

export default function Reconciliation() {
  const { data: r, error, refreshing, refresh } = useLoad(() => api('/v1/reconciliation'));
  if (!r) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} style={{ gap: 16, paddingTop: 12 }}>
      <View style={[st.hero, { borderColor: r.ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.5)', backgroundColor: r.ok ? '#0c1a12' : '#1d0e0e' }]}>
        <Ionicons name={r.ok ? 'shield-checkmark' : 'warning'} size={44} color={r.ok ? colors.green : colors.red} />
        <Text style={st.title}>{r.ok ? 'Aucun écart' : `${r.errors} écart${r.errors > 1 ? 's' : ''} détecté${r.errors > 1 ? 's' : ''}`}</Text>
        <T.Muted style={{ textAlign: 'center' }}>
          Votre solde est la somme d’écritures qu’on ne modifie jamais. Chaque opération doit y avoir exactement ses écritures. Vérifié {dateTime(r.checked_at)}.
        </T.Muted>
      </View>

      <Card style={{ paddingVertical: 4 }}>
        {CHECKS.map(([k, label, what], i) => (
          <View key={k} style={[st.row, i < CHECKS.length - 1 && st.line]}>
            <Ionicons name="checkmark-circle" size={22} color={colors.green} />
            <View style={{ flex: 1 }}>
              <Text style={st.rowTitle}>
                {r.checked[k]} {label}
              </Text>
              <T.Muted>{what}</T.Muted>
            </View>
          </View>
        ))}
      </Card>

      {r.issues.length > 0 && (
        <View style={{ gap: 8 }}>
          <T.H2>À examiner</T.H2>
          {r.issues.map((i, k) => (
            <View key={k} style={[st.issue, { backgroundColor: i.severity === 'error' ? colors.redSoft : colors.amberSoft }]}>
              <Ionicons name={i.severity === 'error' ? 'close-circle' : 'alert-circle'} size={20} color={i.severity === 'error' ? colors.red : colors.amber} />
              <View style={{ flex: 1 }}>
                <Text style={st.issueText}>{i.message}</Text>
                <T.Mono style={{ color: colors.muted, fontSize: 11 }}>{i.ref}</T.Mono>
              </View>
            </View>
          ))}
        </View>
      )}

      <Button title="Vérifier à nouveau" icon="refresh" variant="ghost" onPress={refresh} loading={refreshing} />
    </Screen>
  );
}

const st = StyleSheet.create({
  hero: { alignItems: 'center', gap: 10, padding: 24, borderRadius: radius.xl, borderWidth: 1 },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 26 },
  row: { flexDirection: 'row', gap: 12, paddingVertical: 14, alignItems: 'flex-start' },
  line: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowTitle: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 15 },
  issue: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, alignItems: 'flex-start' },
  issueText: { color: colors.text, fontFamily: fonts.bodyMedium, fontSize: 14 },
});

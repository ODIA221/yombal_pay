// Fiche d'un paiement : montants, commission, preuve, reçu à ouvrir ou à envoyer au client.
import { Linking, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { api, webUrl } from '../../lib/api';
import { useLoad } from '../../lib/useLoad';
import { dateTime, fcfa, num, SOURCE } from '../../lib/format';
import { Banner, Button, Card, ErrorText, Loading, Pill, Screen, T, tap } from '../../components/ui';
import { CHAINS, colors, fonts } from '../../theme';

export default function PaymentDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { data: c, error } = useLoad(() => api(`/v1/checkouts/${id}`), { every: 5000 });
  if (!c) return error ? <Screen><ErrorText>{error}</ErrorText></Screen> : <Loading />;

  const usdt = c.pay_asset === 'USDT' || c.usdt?.received;
  const rows = [
    ['Référence', c.reference],
    ...(usdt
      ? [
          [c.status === 'paid' ? 'Payé en' : 'Déjà reçu', `${c.usdt.received} sur ${c.usdt.amount} USDT`],
          ['Réseau', c.usdt.addresses.map((a) => CHAINS[a.chain] || a.chain).join(', ')],
        ]
      : [
          ['Montant Bitcoin', `${num(c.amount_sats)} sats`],
          ...(c.fee_sats !== undefined ? [['Commission YombalPay', `${num(c.fee_sats)} sats`]] : []),
          ['Taux appliqué', `1 BTC = ${fcfa(c.rate?.xof_per_btc)}`],
        ]),
    ['Canal', SOURCE[c.source] || c.source],
    ['Créé le', dateTime(c.created_at)],
    ['Payé le', dateTime(c.paid_at)],
    ...(c.payer_note ? [['Note du client', c.payer_note]] : []),
  ];
  const receipt = webUrl(`/recu/${c.id}`);
  const proof = c.proof?.type === 'lightning' ? c.proof.payment_hash : c.proof?.transactions?.[0]?.hash;

  return (
    <Screen style={{ gap: 16, paddingTop: 12 }}>
      <View style={{ gap: 6 }}>
        <Pill status={c.status} />
        <T.Title>{fcfa(c.amount)}</T.Title>
        <T.Muted>{c.description}</T.Muted>
      </View>

      {c.status === 'paid' && c.savings?.xof > 0 && <Banner icon="sparkles">Le client a évité {fcfa(c.savings.xof)} de frais.</Banner>}

      <Card style={{ paddingVertical: 6 }}>
        {rows.map(([k, v], i) => (
          <View key={k} style={[st.kv, i < rows.length - 1 && st.kvLine]}>
            <Text style={st.k}>{k}</Text>
            <Text style={st.v} selectable>
              {v}
            </Text>
          </View>
        ))}
      </Card>

      {proof && (
        <Card style={{ gap: 6 }}>
          <T.Eyebrow>{c.proof.type === 'lightning' ? 'Preuve : empreinte de la facture' : 'Preuve : transaction blockchain'}</T.Eyebrow>
          <T.Mono selectable style={{ color: colors.muted }}>
            {proof}
          </T.Mono>
        </Card>
      )}

      {c.status === 'paid' ? (
        <View style={{ gap: 10 }}>
          <Button title="Voir le reçu" icon="document-text-outline" onPress={() => Linking.openURL(receipt)} />
          <Button title="Envoyer le reçu au client" icon="share-outline" variant="ghost" onPress={() => Share.share({ message: `Votre reçu ${c.merchant?.name} : ${fcfa(c.amount)}\n${receipt}` })} />
        </View>
      ) : c.status === 'pending' ? (
        <Button title="Reprendre l'encaissement" icon="qr-code" onPress={() => router.push(`/encaisser/${c.id}`)} />
      ) : null}
      <Button title="Copier l'identifiant" icon="copy-outline" variant="link" onPress={() => (tap(), Clipboard.setStringAsync(c.id))} />
    </Screen>
  );
}

const st = StyleSheet.create({
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 12 },
  kvLine: { borderBottomWidth: 1, borderBottomColor: colors.line },
  k: { color: colors.muted, fontFamily: fonts.body, fontSize: 14 },
  v: { color: colors.text, fontFamily: fonts.bodyBold, fontSize: 14, flexShrink: 1, textAlign: 'right' },
});

// Crée une facture Lightning de test à partir d'un montant en FCFA : npm run invoice -- 5000
import crypto from "node:crypto";
import { createLightningInvoice } from "../src/bitnob.js";
import { getBtcXofRate, xofToSats } from "../src/rates.js";

const amountXof = Number(process.argv[2] || 5000);
const rate = await getBtcXofRate();
const amountSats = xofToSats(amountXof, rate.btcXof);
console.log(`${amountXof} FCFA = ${amountSats} sats (1 BTC = ${rate.btcXof} FCFA, source : ${rate.source})`);

try {
  const invoice = await createLightningInvoice({
    amountSats,
    description: `YombalPay · test ${amountXof} FCFA`,
    reference: `tp_test_${crypto.randomUUID()}`,
  });
  console.log(JSON.stringify(invoice, null, 2));
} catch (err) {
  console.error(`ÉCHEC : ${err.message}`);
  if (err.data) console.error(JSON.stringify(err.data, null, 2));
  process.exit(1);
}

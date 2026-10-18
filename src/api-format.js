// Représentation publique d'un paiement renvoyée aux développeurs (style snake_case).
export function toApi(checkout, baseUrl = checkout.baseUrl) {
  return {
    id: checkout.id,
    object: "checkout",
    status: checkout.status,
    amount: checkout.amount,
    currency: checkout.currency,
    amount_sats: checkout.amountSats,
    rate_btc_xof: checkout.rate.btcXof,
    reference: checkout.reference,
    description: checkout.description,
    url: `${baseUrl}/pay/${checkout.id}`,
    lightning_invoice: checkout.paymentRequest,
    return_url: checkout.returnUrl,
    webhook_url: checkout.webhookUrl,
    created_at: checkout.createdAt,
    expires_at: checkout.expiresAt,
    paid_at: checkout.paidAt,
    livemode: Boolean(checkout.livemode),
  };
}

// Paiement de test : créé avec une clé sk_test_, facture sur Bitcoin testnet.
export function isTestInvoice(checkout) {
  return !checkout.livemode;
}

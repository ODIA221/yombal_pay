# Plugin WooCommerce YombalPay

Ce plugin ajoute « Payer en Bitcoin ⚡ » au tunnel de commande d'une boutique WooCommerce dont la devise est le **franc CFA (XOF)**.

## Installation

1. Zippez le dossier `yombalpay/` et installez-le via **Extensions → Ajouter → Téléverser**, ou copiez-le dans `wp-content/plugins/`.
2. Ouvrez **WooCommerce → Réglages → Paiements → YombalPay** et renseignez :
   - l'URL de la passerelle (votre instance YombalPay, en HTTPS) ;
   - la clé secrète `sk_…` (Espace marchand → Développeurs) ;
   - le secret webhook `whsec_…`.
3. La devise de la boutique doit être **XOF**.

## Fonctionnement

1. Au paiement, le plugin crée un checkout YombalPay avec le montant de la commande. La référence est `WC-<id>-<clé>`, ce qui la rend idempotente.
2. Le client est redirigé vers la page de paiement Lightning, puis revient sur la page de remerciement.
3. YombalPay envoie `checkout.paid` à `https://votre-boutique/?wc-api=yombalpay`, signé en HMAC-SHA256. Le plugin vérifie trois choses :
   - la signature et son horodatage (5 minutes maximum, contre le rejeu) ;
   - la correspondance entre la commande et le checkout ;
   - le statut, relu auprès de la passerelle avec la clé secrète, ainsi que le montant.

   La commande passe ensuite à « Payée ».

> Le plugin est fourni tel quel. Il n'a pas encore été testé sur une installation WordPress réelle. Testez-le sur un site de recette avant la production.

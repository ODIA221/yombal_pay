# Kit Demo Day : YombalPay

Ce que le jury regarde (curriculum Code & Chain) : **un vrai problème, une démo qui marche, un usage clair de l'API Bitnob, une équipe crédible.**

## Pitch de 5 minutes, en 6 temps

**1. Accroche (0:00 – 0:20)**
« Levez la main si vous avez déjà envoyé de l'argent à quelqu'un au Sénégal depuis l'étranger. Combien avez-vous payé de frais ? »

**2. Problème (0:20 – 1:00)**
« Aïssatou vend du wax à Dakar. Sa meilleure cliente, Fatou, vit à Paris. Fatou n'a pas Wave sénégalais, sa carte coûte 4 % et les passerelles Bitcoin étrangères ne versent pas un franc CFA. Et même si Aïssatou recevait du Bitcoin, elle aurait peur de la volatilité et ne saurait pas le transformer en argent pour payer son fournisseur. Résultat : la vente ne se fait pas. »

**3. Solution (1:00 – 1:40)**
« YombalPay, c'est la caisse Bitcoin des commerçants d'Afrique de l'Ouest. On ferme la boucle complète : le client paie en Lightning depuis n'importe où, le solde s'affiche en FCFA, la valeur est protégée en USDT, et Aïssatou retire sur Wave. Elle n'a jamais besoin de comprendre ce qu'est le Bitcoin. Trois produits Bitnob dans une seule application : Lightning, Trading, Payouts. »

**4. Démo live (1:40 – 3:40)** : voir la chorégraphie ci-dessous.

**5. Sous le capot (3:40 – 4:30)**
« Ce n'est pas une maquette. Il y a des comptes marchands, et une base Supabase dont le RLS bloque l'API publique. On tient un vrai registre comptable : le solde est la somme d'écritures qu'on ne modifie jamais. Le statut "payé" ne vient jamais du navigateur : il faut un webhook Bitnob signé HMAC-SHA512, reconfirmé par l'API Bitnob. Chaque débit passe par un verrou : on a testé cinq retraits simultanés, sans aucune double dépense. Un retrait exige le mot de passe. Les clés API sont stockées hachées. 60 tests de bout en bout. »

**6. Suite (4:30 – 5:00)**
« Déjà là : comptes caissiers, retrait automatique, plugin WooCommerce, pages client en anglais pour la diaspora. Prochaines étapes : KYC marchand, Shopify, wolof. Chaque boutique sénégalaise devient accessible à la diaspora et au monde entier. YombalPay : parce que se faire payer doit être yombal, simple pour tout le monde. »

## Chorégraphie de la démo (2 min)

Préparez 3 onglets : l'espace marchand (`/app`), la caisse sur le téléphone (`/app/caisse`) et la page publique (`/@waxco`). Ayez aussi un portefeuille Lightning approvisionné sur un second téléphone.

1. **Caisse (téléphone)** : « Aïssatou est au marché. » Tapez **500**, puis **Encaisser**. Le QR s'affiche avec le montant en sats et un compte à rebours.
2. **Un membre du jury scanne et paie** avec un vrai portefeuille. La caisse **sonne**, le grand ✓ vert s'affiche, et le toast « 500 FCFA reçus » apparaît sur l'écran projeté.
3. **Espace marchand** : le solde et le graphique se mettent à jour en direct. « Voici le webhook Bitnob, vérifié puis reconfirmé. »
4. **Adresse Lightning** : « Fatou, à Paris, n'a même pas besoin d'un lien. » Montrez `waxco@<domaine>` et payez-la depuis un portefeuille.
5. **Portefeuille → Protéger en USDT (50 %)** : « Trading Bitnob. La volatilité ne fait plus peur. » Montrez le réglage de protection automatique.
6. **Portefeuille → Retirer vers Wave** : 2 000 FCFA, numéro, mot de passe. Le statut passe à « Reçu ». « Payouts Bitnob. La boucle est bouclée. »
7. Bonus diaspora : sur `/@waxco` en anglais, cochez « I'm paying for a relative ». Le paiement apparaît chez le marchand comme « Pour Maman ».
8. Si le temps le permet, ouvrez **Paiements**, puis la fiche d'un paiement, pour montrer la **preimage**, c'est-à-dire la preuve cryptographique du paiement.

## Check-list avant de monter sur scène

- [ ] `./run.sh check` tout vert avec les vraies clés Bitnob
- [ ] `DATABASE_URL` Supabase dans `.env`, `./run.sh` démarre (« Base de données : Supabase »)
- [ ] Tunnel HTTPS ouvert, `PUBLIC_URL` à jour, webhook `…/webhooks/bitnob` déclaré chez Bitnob
- [ ] Corridor SN vérifié dans **Portefeuille** (sinon `PAYOUT_MODE=simulated`, et le dire honnêtement)
- [ ] Un vrai paiement de 500 FCFA testé de bout en bout moins d'une heure avant
- [ ] Caisse installée sur l'écran d'accueil du téléphone (PWA), son activé
- [ ] Vidéo de secours enregistrée
- [ ] Plan B réseau : `DEMO_MODE=true` sans `DATABASE_URL` (Postgres local), puis bouton « Simuler le paiement (démo) », qui passe par le même code que le vrai webhook
- [ ] Dépôt GitHub public à jour
- [ ] Deux répétitions chronométrées

## Réponses prêtes pour le jury

**Pourquoi Bitcoin et pas Wave ?** Wave ne sert pas les clients hors du Sénégal. Lightning fonctionne depuis n'importe quel pays, en quelques secondes, pour quelques sats. Et on **retire sur** Wave : on complète Wave, on ne le remplace pas.

**Et la volatilité ?** Le taux est figé pendant la validité de la facture (15 min). Ensuite, le marchand convertit en USDT via le trading Bitnob, manuellement ou automatiquement (par exemple 80 % de chaque paiement).

**Le retrait mobile money est-il réel ?** Oui : il passe par les payouts Bitnob (quote → initialize → finalize). L'application vérifie si le corridor Sénégal est ouvert sur le compte via `supported-countries`. S'il ne l'est pas encore, le retrait est explicitement marqué « simulé ».

**Qui détient les fonds ?** Le compte Bitnob de YombalPay. Chaque marchand a un solde tenu dans un registre comptable en ajout seul, et chaque retrait est rapproché par référence. C'est le modèle de PayDunya. En production : KYC marchand et plafonds par niveau.

**Et la sécurité ?**
- Les mots de passe sont hachés avec scrypt, les clés API avec SHA-256, et la clé n'est affichée qu'une fois.
- Les sessions passent par un cookie HttpOnly. Il y a une protection CSRF et une CSP stricte.
- Un retrait n'est jamais possible avec une clé API : il faut le mot de passe.
- Un verrou par marchand empêche la double dépense, et le RLS Supabase est activé.

**Comment vérifiez-vous les webhooks Bitnob ?** Par la signature HMAC-SHA512 du corps brut, puis par une reconfirmation via `GET /api/lightning/invoices/:id`. Un webhook falsifié ne peut pas créditer un solde.

**Et si un webhook se perd ?** Un vérificateur interroge Bitnob toutes les 4 secondes pour les factures en attente. Le client a aussi un bouton « J'ai payé : vérifier ».

**Le modèle économique ?** Une commission de 1 % par paiement, prélevée en sats et visible dans le registre et dans la fiche de chaque paiement.

**La concurrence ?** PayDunya et Wave : pas de clients étrangers, pas de Bitcoin. BitPay et OpenNode : ni FCFA ni mobile money. BTCPay : il faut un serveur et des compétences. Personne ne combine encaissement mondial, prix en FCFA, protection USDT et retrait Wave.

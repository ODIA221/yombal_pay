// Boutique de démonstration : elle se comporte comme un site marchand indépendant.
// Elle crée les paiements via l'API publique /v1/checkouts et ne marque une commande
// payée qu'à la réception du webhook signé checkout.paid.
import crypto from "node:crypto";
import express from "express";
import { config } from "./config.js";
import { saveOrder, getOrder } from "./store.js";
import { verifySignature } from "./merchant-webhooks.js";
import { renderShop, renderOrder } from "./views/shop.js";

const PRODUCTS = [
  { id: "bissap", name: "Bissap séché, 1 kg", amount: 5000, pic: "bissap", text: "Fleurs d'hibiscus de Kaolack, séchées au soleil." },
  { id: "wax", name: "Tissu wax, 6 yards", amount: 15000, pic: "wax", text: "Coton imprimé, choisi au marché HLM de Dakar." },
  { id: "cuir", name: "Sac en cuir de Ngaye", amount: 25000, pic: "cuir", text: "Cousu main par les artisans de Ngaye Mékhé." },
];

export const shop = express.Router();
const publicBase = (req) => `${req.protocol}://${req.get("x-forwarded-host") || req.get("host")}`;

shop.get("/", (_req, res) => {
  res.type("html").send(renderShop({ products: PRODUCTS, merchantName: config.merchantName }));
});

shop.post("/commander", express.urlencoded({ extended: false }), async (req, res) => {
  const product = PRODUCTS.find((p) => p.id === req.body?.produit);
  if (!product) return res.status(400).type("text").send("Produit inconnu.");

  const base = publicBase(req);
  const order = await saveOrder({
    id: "cmd_" + crypto.randomBytes(5).toString("hex"),
    product: product.id,
    name: product.name,
    amount: product.amount,
    status: "pending",
    createdAt: new Date().toISOString(),
  });

  try {
    // Appel à l'API YombalPay, exactement comme le ferait un site marchand externe.
    const r = await fetch(`http://127.0.0.1:${config.port}/v1/checkouts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        "Content-Type": "application/json",
        "X-Forwarded-Host": req.get("x-forwarded-host") || req.get("host"),
        "X-Forwarded-Proto": req.protocol,
      },
      body: JSON.stringify({
        amount: product.amount,
        currency: "XOF",
        reference: order.id,
        description: product.name,
        return_url: `${base}/boutique/commande/${order.id}`,
        webhook_url: `${base}/boutique/webhook`,
      }),
    });
    const checkout = await r.json();
    if (!r.ok) throw new Error(checkout?.error?.message || `HTTP ${r.status}`);

    order.checkoutId = checkout.id;
    await saveOrder(order);
    res.redirect(303, checkout.url);
  } catch (err) {
    console.error(`[boutique] paiement impossible pour ${order.id} : ${err.message}`);
    res.status(502).type("html").send(
      renderShop({ products: PRODUCTS, merchantName: config.merchantName, error: `Le paiement n'a pas pu être créé : ${err.message}` }),
    );
  }
});

// Webhook reçu de YombalPay : la signature est vérifiée avant toute chose.
shop.post("/webhook", async (req, res) => {
  if (!verifySignature(req.rawBody, req.get("yombal-signature"), config.merchantWebhookSecret)) {
    return res.status(400).json({ error: "Signature invalide" });
  }
  const event = req.body;
  if (event?.type === "checkout.paid") {
    const order = await getOrder(event.data?.reference);
    if (order && order.status !== "paid") {
      order.status = "paid";
      order.paidAt = new Date().toISOString();
      order.checkoutId = event.data.id;
      await saveOrder(order);
      console.log(`[boutique] commande ${order.id} payée (${order.amount} FCFA)`);
    }
  }
  res.json({ received: true });
});

shop.get("/commande/:id", async (req, res) => {
  const order = await getOrder(req.params.id);
  if (!order) return res.status(404).type("text").send("Commande introuvable.");
  res.set("Cache-Control", "no-store").type("html").send(renderOrder({ order, merchantName: config.merchantName }));
});

shop.get("/commande/:id/statut", async (req, res) => {
  const order = await getOrder(req.params.id);
  res.set("Cache-Control", "no-store").json({ status: order?.status ?? "not_found" });
});

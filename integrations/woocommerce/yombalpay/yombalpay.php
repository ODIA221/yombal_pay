<?php
/**
 * Plugin Name: YombalPay — Bitcoin Lightning en FCFA
 * Description: Acceptez Bitcoin Lightning sur WooCommerce avec des prix en FCFA. Paiements confirmés par webhook signé YombalPay.
 * Version: 1.0.0
 * Author: YombalPay
 * Requires PHP: 7.4
 * WC requires at least: 6.0
 * License: MIT
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('plugins_loaded', function () {
    if (!class_exists('WC_Payment_Gateway')) {
        return;
    }

    class WC_Gateway_YombalPay extends WC_Payment_Gateway
    {
        const SIGNATURE_TOLERANCE = 300; // secondes (anti-rejeu)

        public function __construct()
        {
            $this->id                 = 'yombalpay';
            $this->method_title       = 'YombalPay (Bitcoin Lightning)';
            $this->method_description = 'Vos prix restent en FCFA ; le client paie en Bitcoin Lightning depuis n\'importe quel pays.';
            $this->has_fields         = false;
            $this->supports           = ['products'];

            $this->init_form_fields();
            $this->init_settings();

            $this->title          = $this->get_option('title');
            $this->description    = $this->get_option('description');
            $this->api_url        = rtrim($this->get_option('api_url'), '/');
            $this->secret_key     = $this->get_option('secret_key');
            $this->webhook_secret = $this->get_option('webhook_secret');

            add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
            add_action('woocommerce_api_yombalpay', [$this, 'handle_webhook']);
        }

        public function init_form_fields()
        {
            $this->form_fields = [
                'enabled'        => ['title' => 'Activer', 'type' => 'checkbox', 'label' => 'Activer YombalPay', 'default' => 'yes'],
                'title'          => ['title' => 'Titre', 'type' => 'text', 'default' => 'Payer en Bitcoin ⚡ (Lightning)'],
                'description'    => ['title' => 'Description', 'type' => 'textarea', 'default' => 'Payez depuis n\'importe quel pays avec un portefeuille Lightning. Confirmation en quelques secondes.'],
                'api_url'        => ['title' => 'URL de la passerelle', 'type' => 'text', 'default' => 'https://votre-passerelle-yombalpay', 'description' => 'Sans « / » final.'],
                'secret_key'     => ['title' => 'Clé secrète (sk_…)', 'type' => 'password', 'description' => 'Espace marchand → Développeurs.'],
                'webhook_secret' => ['title' => 'Secret webhook (whsec_…)', 'type' => 'password', 'description' => 'Espace marchand → Développeurs → Webhook. URL de notification : ' . esc_html(WC()->api_request_url('yombalpay'))],
            ];
        }

        public function is_available()
        {
            return parent::is_available() && get_woocommerce_currency() === 'XOF' && $this->secret_key && $this->api_url;
        }

        private function api($method, $path, $body = null)
        {
            $args = [
                'method'  => $method,
                'timeout' => 20,
                'headers' => ['Authorization' => 'Bearer ' . $this->secret_key, 'Content-Type' => 'application/json'],
            ];
            if ($body !== null) {
                $args['body'] = wp_json_encode($body);
            }
            $res = wp_remote_request($this->api_url . $path, $args);
            if (is_wp_error($res)) {
                throw new Exception('YombalPay injoignable : ' . $res->get_error_message());
            }
            $json = json_decode(wp_remote_retrieve_body($res), true);
            $code = wp_remote_retrieve_response_code($res);
            if ($code >= 400) {
                throw new Exception(isset($json['error']['message']) ? $json['error']['message'] : 'Erreur YombalPay ' . $code);
            }
            return $json;
        }

        public function process_payment($order_id)
        {
            $order = wc_get_order($order_id);
            try {
                $checkout = $this->api('POST', '/v1/checkouts', [
                    'amount'      => (int) round($order->get_total()),
                    'currency'    => 'XOF',
                    'reference'   => 'WC-' . $order->get_id() . '-' . $order->get_order_key(),
                    'description' => sprintf('%s — commande #%s', get_bloginfo('name'), $order->get_order_number()),
                    'return_url'  => $this->get_return_url($order),
                    'webhook_url' => WC()->api_request_url('yombalpay'),
                    'customer_email' => $order->get_billing_email(),
                    'metadata'    => ['order_id' => (string) $order->get_id()],
                ]);
            } catch (Exception $e) {
                wc_add_notice('Paiement Bitcoin indisponible : ' . $e->getMessage(), 'error');
                return ['result' => 'failure'];
            }
            $order->update_meta_data('_yombalpay_checkout_id', $checkout['id']);
            $order->update_status('pending', 'En attente du paiement Lightning (' . $checkout['amount_sats'] . ' sats).');
            $order->save();
            return ['result' => 'success', 'redirect' => $checkout['pay_url']];
        }

        // Vérifie X-YombalPay-Signature: t=<ts>,v1=<hex HMAC-SHA256(secret, "t.body")>
        private function verify_signature($raw, $header)
        {
            $parts = [];
            foreach (explode(',', (string) $header) as $kv) {
                $pair = array_map('trim', explode('=', $kv, 2));
                if (count($pair) === 2) {
                    $parts[$pair[0]] = $pair[1];
                }
            }
            if (empty($parts['t']) || empty($parts['v1']) || abs(time() - (int) $parts['t']) > self::SIGNATURE_TOLERANCE) {
                return false;
            }
            $expected = hash_hmac('sha256', $parts['t'] . '.' . $raw, $this->webhook_secret);
            return hash_equals($expected, $parts['v1']);
        }

        public function handle_webhook()
        {
            $raw = file_get_contents('php://input');
            $sig = isset($_SERVER['HTTP_X_YOMBALPAY_SIGNATURE']) ? wp_unslash($_SERVER['HTTP_X_YOMBALPAY_SIGNATURE']) : '';
            if (!$this->webhook_secret || !$this->verify_signature($raw, $sig)) {
                status_header(401);
                exit('signature invalide');
            }
            $event = json_decode($raw, true);
            if (($event['type'] ?? '') !== 'checkout.paid') {
                status_header(200);
                exit('ignoré');
            }
            $order_id = (int) ($event['data']['metadata']['order_id'] ?? 0);
            $order    = $order_id ? wc_get_order($order_id) : null;
            if (!$order || $order->get_meta('_yombalpay_checkout_id') !== ($event['data']['id'] ?? '')) {
                status_header(404);
                exit('commande inconnue');
            }
            if (!$order->is_paid()) {
                // Double contrôle : on relit le paiement auprès de la passerelle avec la clé secrète
                try {
                    $checkout = $this->api('GET', '/v1/checkouts/' . rawurlencode($event['data']['id']));
                } catch (Exception $e) {
                    status_header(502);
                    exit('vérification impossible');
                }
                if (($checkout['status'] ?? '') === 'paid' && (int) $checkout['amount'] === (int) round($order->get_total())) {
                    $order->payment_complete($checkout['id']);
                    $order->add_order_note(sprintf('Payé en Bitcoin Lightning : %s sats (YombalPay %s).', $checkout['amount_sats'], $checkout['id']));
                }
            }
            status_header(200);
            exit('ok');
        }
    }

    add_filter('woocommerce_payment_gateways', function ($gateways) {
        $gateways[] = 'WC_Gateway_YombalPay';
        return $gateways;
    });
});

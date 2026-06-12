#!/bin/sh
set -e

DOMAIN="${DOMAIN:-localhost}"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
TEMPLATE_DIR="/etc/nginx/templates"
CONF="/etc/nginx/conf.d/default.conf"

if [ -f "$CERT" ]; then
  echo "[nginx] Certificado encontrado → modo HTTPS"
  envsubst '${DOMAIN}' < "${TEMPLATE_DIR}/default-https.conf.template" > "$CONF"
else
  echo "[nginx] Sin certificado → modo HTTP (para obtener cert con certbot)"
  envsubst '${DOMAIN}' < "${TEMPLATE_DIR}/default-http.conf.template" > "$CONF"
fi

exec nginx -g 'daemon off;'

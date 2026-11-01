#!/usr/bin/env bash
# usage (as root, inside the project folder):  bash deploy.sh yourdomain.com [email]
set -euo pipefail
DOMAIN="${1:-}"; EMAIL="${2:-}"
[ -n "$DOMAIN" ] || { echo "usage: bash deploy.sh yourdomain.com [email]"; exit 1; }
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
cd "$(dirname "$0")"
APP=/opt/amirkala; ENVF=/etc/amirkala.env
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates rsync nginx ufw build-essential python3 sqlite3 certbot python3-certbot-nginx
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
id amirkala &>/dev/null || useradd --system --home "$APP" --shell /usr/sbin/nologin amirkala
mkdir -p "$APP" /var/lib/amirkala
rsync -a --exclude node_modules --exclude data ./ "$APP"/
( cd "$APP" && npm install --omit=dev )
chown -R amirkala:amirkala "$APP" /var/lib/amirkala
NEWPASS=""
if [ ! -f "$ENVF" ]; then
  NEWPASS=$(head -c 24 /dev/urandom | base64 | tr -d '/+=' | cut -c1-16)
  cat > "$ENVF" <<EOT
PORT=3000
HOST=127.0.0.1
DATA_DIR=/var/lib/amirkala
TZ=Asia/Tehran
NODE_ENV=production
ADMIN_USER=admin
ADMIN_PASSWORD=$NEWPASS
SITE_URL=https://$DOMAIN
CARD_NUMBER=
EOT
  chmod 600 "$ENVF"
fi
cp deploy/amirkala.service /etc/systemd/system/amirkala.service
sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx.conf > /etc/nginx/sites-available/amirkala
ln -sf /etc/nginx/sites-available/amirkala /etc/nginx/sites-enabled/amirkala
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable
systemctl daemon-reload; systemctl enable --now amirkala
if [ -n "$EMAIL" ]; then CB="-m $EMAIL"; else CB="--register-unsafely-without-email"; fi
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" $CB --agree-tos -n --redirect || echo "!! SSL failed: check that the DNS A records point to this server, then re-run certbot"
echo "=============================================="
echo "Site:  https://$DOMAIN      Admin: https://$DOMAIN/#admin"
[ -n "$NEWPASS" ] && echo "Admin user: admin   Password: $NEWPASS   (save it, then change it: cd $APP && sudo -u amirkala DATA_DIR=/var/lib/amirkala npm run passwd -- admin NEWPASS)"
echo "Card number for card-to-card payments: edit CARD_NUMBER in $ENVF then: systemctl restart amirkala"

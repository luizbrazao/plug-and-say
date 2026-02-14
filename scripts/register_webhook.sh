#!/bin/bash

# Plug and Say - Telegram Webhook Registration Utility
# Usage: ./scripts/register_webhook.sh <BOT_TOKEN> <DEPT_SLUG> <HTTPS_CONVEX_SITE_URL>

TOKEN=$1
SLUG=$2
BASE_URL=$3

if [ -z "$TOKEN" ] || [ -z "$SLUG" ] || [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <BOT_TOKEN> <DEPT_SLUG> <CONVEX_SITE_URL>"
  echo "Example: $0 123456:ABCDE my-dept https://happy-otter-123.convex.site"
  exit 1
fi

WEBHOOK_URL="${BASE_URL}/telegram-webhook/${SLUG}"

echo "Registering webhook for bot..."
echo "Target URL: ${WEBHOOK_URL}"

curl -X POST "https://api.telegram.org/bot${TOKEN}/setWebhook" \
     -H "Content-Type: application/json" \
     -d "{\"url\": \"${WEBHOOK_URL}\"}"

echo -e "\nDone."

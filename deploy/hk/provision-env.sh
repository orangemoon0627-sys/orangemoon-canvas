#!/bin/sh
set -eu

destination=${1:-.env}
image_tag=${2:-}
if [ -z "$image_tag" ]; then
    echo "usage: provision-env.sh [destination] <image-tag>" >&2
    exit 2
fi
if [ -e "$destination" ]; then
    echo "$destination already exists; refusing to replace production secrets" >&2
    exit 1
fi
command -v openssl >/dev/null 2>&1 || { echo "openssl is required" >&2; exit 1; }

minimax_api_key=""
minimax_voice_id=""
if [ ! -t 0 ]; then
    IFS= read -r minimax_api_key || true
    IFS= read -r minimax_voice_id || true
fi

umask 077
postgres_password=$(openssl rand -hex 32)
ip_hash_salt=$(openssl rand -hex 32)
agent_internal_secret=$(openssl rand -hex 32)
admin_password="OM$(openssl rand -hex 18)Aa1"

cat > "$destination" <<EOF
IMAGE_TAG=$image_tag
POSTGRES_DB=orangemoon
POSTGRES_USER=orangemoon
POSTGRES_PASSWORD=$postgres_password
PLATFORM_ALLOWED_ORIGINS=https://canvas.orangemoon.tech,https://canvas.38-76-223-32.sslip.io
PLATFORM_BODY_LIMIT_MB=32
PLATFORM_MAX_CONCURRENT_GENERATIONS=2
PLATFORM_SESSION_DAYS=30
PLATFORM_IP_HASH_SALT=$ip_hash_salt
PLATFORM_METAJING_USD_TO_CNY=1.0
PLATFORM_MINIMAX_USD_TO_CNY=7.3
PLATFORM_PRICE_MARKUP=1.65
PLATFORM_AGENT_INPUT_CREDITS_PER_MILLION=18.563
PLATFORM_AGENT_CACHED_INPUT_CREDITS_PER_MILLION=1.857
PLATFORM_AGENT_OUTPUT_CREDITS_PER_MILLION=111.375
PLATFORM_AGENT_RESERVE_CREDITS=2
CANVAS_AGENT_INTERNAL_SECRET=$agent_internal_secret
OPENAI_BASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-terra
OPENAI_REASONING_EFFORT=high
OPENAI_MAX_OUTPUT_TOKENS=6000
CANVAS_AGENT_MAX_CONCURRENT=2
CANVAS_AGENT_BODY_LIMIT=30mb
MANUAL_ALIPAY_ENABLED=true
MANUAL_ALIPAY_PAYEE=橙月画布
MANUAL_ALIPAY_QR_URL=
MANUAL_ALIPAY_INSTRUCTIONS=提交充值订单并完成转账后，由管理员核对到账记录并入账。
MANUAL_WECHAT_ENABLED=true
MANUAL_WECHAT_PAYEE=橙月画布
MANUAL_WECHAT_QR_URL=
MANUAL_WECHAT_INSTRUCTIONS=提交充值订单并完成转账后，由管理员核对到账记录并入账。
METAJING_API_KEY=
MINIMAX_AUDIO_API_KEY=$minimax_api_key
MINIMAX_DEFAULT_VOICE_ID=$minimax_voice_id
NGINX_CLIENT_MAX_BODY_SIZE=32m
BACKUP_RETENTION_DAYS=14
EOF
chmod 600 "$destination"

cat > .admin.initial <<EOF
ADMIN_EMAIL=admin@orangemoon.tech
ADMIN_DISPLAY_NAME=橙月管理员
ADMIN_PASSWORD=$admin_password
EOF
chmod 600 .admin.initial
echo "created $destination and one-time administrator credentials"

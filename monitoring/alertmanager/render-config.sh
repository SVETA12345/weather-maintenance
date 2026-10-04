#!/bin/sh
# Рендерит шаблон alertmanager.yml в готовую конфигурацию и запускает Alertmanager.
#
# Нужен потому, что Alertmanager не подставляет переменные окружения в файле
# конфигурации: без этого шага в smarthost попадёт буквальное '${ALERT_SMTP_HOST}'
# и отправка оповещений падает с "unknown port".
set -eu

TEMPLATE="${ALERTMANAGER_TEMPLATE:-/etc/alertmanager/alertmanager.yml}"
RENDERED="${ALERTMANAGER_RENDERED:-/alertmanager/alertmanager.yml}"

# Значения из окружения compose с теми же безопасными дефолтами, что и .env.example.
# Реальные адрес и пароль SMTP задаются в .env (файл не отслеживается git), например:
#   ALERT_SMTP_HOST=smtp.mail.ru  ALERT_SMTP_PORT=587  ALERT_SMTP_REQUIRE_TLS=true
: "${ALERT_EMAIL_TO:=ops@example.com}"
: "${ALERT_EMAIL_FROM:=alerts@example.com}"
: "${ALERT_SMTP_HOST:=localhost}"
: "${ALERT_SMTP_PORT:=25}"
: "${ALERT_SMTP_USER:=alerts}"
: "${ALERT_SMTP_PASSWORD:=alerts}"
: "${ALERT_SMTP_REQUIRE_TLS:=false}"

export ALERT_EMAIL_TO ALERT_EMAIL_FROM ALERT_SMTP_HOST ALERT_SMTP_PORT
export ALERT_SMTP_USER ALERT_SMTP_PASSWORD ALERT_SMTP_REQUIRE_TLS

# В sed символы & | \ в значении означают спецсимволы замены, поэтому экранируем их.
escape() {
    printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'
}

sed \
    -e "s|@@ALERT_EMAIL_TO@@|$(escape "$ALERT_EMAIL_TO")|g" \
    -e "s|@@ALERT_EMAIL_FROM@@|$(escape "$ALERT_EMAIL_FROM")|g" \
    -e "s|@@ALERT_SMTP_HOST@@|$(escape "$ALERT_SMTP_HOST")|g" \
    -e "s|@@ALERT_SMTP_PORT@@|$(escape "$ALERT_SMTP_PORT")|g" \
    -e "s|@@ALERT_SMTP_USER@@|$(escape "$ALERT_SMTP_USER")|g" \
    -e "s|@@ALERT_SMTP_PASSWORD@@|$(escape "$ALERT_SMTP_PASSWORD")|g" \
    -e "s|@@ALERT_SMTP_REQUIRE_TLS@@|$(escape "$ALERT_SMTP_REQUIRE_TLS")|g" \
    "$TEMPLATE" > "$RENDERED"

# Пустой шаблон или забытая переменная должны останавливать старт, а не молча
# отправлять оповещения на несуществующий адрес. Проверяем именно токены шаблона:
# символы @@ встречаются и в комментариях к нему.
for token in ALERT_EMAIL_TO ALERT_EMAIL_FROM ALERT_SMTP_HOST ALERT_SMTP_PORT \
    ALERT_SMTP_USER ALERT_SMTP_PASSWORD ALERT_SMTP_REQUIRE_TLS; do
    if grep -q "@@${token}@@" "$RENDERED"; then
        echo "alertmanager: в конфигурации остался неподставленный токен @@${token}@@" >&2
        exit 1
    fi
done

# Проверка синтаксиса до старта: ошибка конфигурации не должна выглядеть как
# «сервис молча не шлёт оповещения».
amtool check-config "$RENDERED"

exec /bin/alertmanager \
    --config.file="$RENDERED" \
    --storage.path="${ALERTMANAGER_STORAGE:-/alertmanager}" \
    "$@"
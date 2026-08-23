#!/bin/sh
set -eu

cd /opt/pass-on-english/Pass_on_English/deploy/tencent-lighthouse
/usr/bin/docker compose --env-file .env.production exec -T nginx nginx -s reload

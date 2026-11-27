#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
temp="$(mktemp -d)"
pid=""
cleanup() {
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
    rm -rf "$temp"
}
trap cleanup EXIT
mkdir "$temp/www"
cp -R "$here/peplog" "$temp/www/peplog"
cp -R "$here/peplog-private" "$temp/peplog-private"
sed -i '/^    advanced_weight_monitor TINYINT NOT NULL DEFAULT 0,$/d' "$temp/peplog-private/schema.sql"
php "$here/tests/fixture.php" > "$temp/peplog-private/config.php"
PEPLOG_TEST_HTTP=1 php -S 127.0.0.1:18085 -t "$temp/www" > "$temp/server.log" 2>&1 &
pid="$!"
base='http://127.0.0.1:18085/peplog/'
for attempt in {1..25}; do
    if curl -s -o /dev/null "$base"; then break; fi
    sleep 0.2
done
trap 'cat "$temp/server.log" >&2' ERR
form_token() { sed -En 's/.*name="csrf" value="([a-f0-9]+)".*/\1/p' "$1" | head -1; }
main_token() { sed -En 's/.*data-token="([a-f0-9]+)".*/\1/p' "$1" | head -1; }
get() { curl -fsS -b "$1" -c "$1" "$base$2"; }
send() {
    local jar="$1" csrf="$2" json="$3"
    curl -sS -b "$jar" -c "$jar" -H "X-CSRF-Token: $csrf" -H 'Content-Type: application/json' \
        -d "$json" --output "$temp/response" --write-out '%{http_code}' "$base""api.php"
}
expect() {
    local expected="$1" actual="$2"
    if [[ "$expected" != "$actual" ]]; then
        echo "HTTP $actual; expected $expected" >&2
        cat "$temp/response" >&2
        return 1
    fi
}
read_json() { php -r '$d=json_decode(file_get_contents($argv[1]),true,32,JSON_THROW_ON_ERROR); eval($argv[2]);' "$1" "$2"; }
admin="$temp/admin.cookies"
member="$temp/member.cookies"
get "$admin" setup.php > "$temp/setup"
grep -q 'name="setup_key"' "$temp/setup"
! grep -q 'cimember' "$temp/setup"
curl -fsS -b "$admin" -c "$admin" --data-urlencode "csrf=$(form_token "$temp/setup")" \
    --data-urlencode 'setup_key=automated-check-install-fixture' "$base""setup.php" > /dev/null
get "$admin" setup.php > "$temp/setup"
grep -q 'name="member_pin"' "$temp/setup"
curl -fsS -b "$admin" -c "$admin" --data-urlencode "csrf=$(form_token "$temp/setup")" \
    --data-urlencode 'admin_pin=64097521' --data-urlencode 'member_pin=57962318' "$base""setup.php" > "$temp/setup"
grep -q 'Setup is complete' "$temp/setup"
php "$here/tests/migrate-advanced-weight.php" "$temp/peplog-private"
get "$admin" '' > "$temp/home"
grep -q 'name="pin"' "$temp/home"
grep -q 'cookie-notice' "$temp/home"
! grep -q 'assets/app.js' "$temp/home"
expect 401 "$(curl -sS -o "$temp/response" -w '%{http_code}' "$base""api.php")"
login() {
    local jar="$1" user="$2" pin="$3" html="$4"
    get "$jar" '' > "$html"
    curl -fsS -b "$jar" -c "$jar" --data-urlencode "csrf=$(form_token "$html")" \
        --data-urlencode "username=$user" --data-urlencode "pin=$pin" "$base" > /dev/null
    get "$jar" '' > "$html"
}
login "$admin" ciadmin 64097521 "$temp/home"
token="$(main_token "$temp/home")"
[[ "$token" =~ ^[a-f0-9]{64}$ ]]
get "$admin" api.php > "$temp/state"
read_json "$temp/state" 'if(count($d["locales"])!==10 || count($d["products"])!==17 || count($d["accounts"])!==2) exit(1);'
member_id="$(read_json "$temp/state" 'foreach($d["accounts"] as $u) if($u["username"]==="cimember") echo $u["id"];')"
monitoring_modes() {
    read_json "$temp/response" "foreach(\$d['state']['accounts'] as \$u) if(\$u['username']==='cimember')
        exit(\$u['weightMonitor']===$1 && \$u['advancedWeightMonitor']===$2 ? 0 : 1); exit(1);"
}
expect 403 "$(send "$admin" bad '{"action":"weightMonitor","target":2,"on":true}')"
expect 200 "$(send "$admin" "$token" "{\"action\":\"weightMonitor\",\"target\":$member_id,\"on\":true}")"
monitoring_modes true false
expect 200 "$(send "$admin" "$token" "{\"action\":\"grantProduct\",\"target\":$member_id,\"product\":\"bpc-pen\",\"on\":true}")"
expect 200 "$(send "$admin" "$token" '{"action":"saveEntry","type":"note","date":"2020-01-01","note":"Fixture journal entry"}')"
id="$(read_json "$temp/response" 'echo $d["id"];')"
login "$member" cimember 57962318 "$temp/patient"
member_token="$(main_token "$temp/patient")"
get "$member" api.php > "$temp/state"
read_json "$temp/state" 'if(count($d["accounts"])!==1 || !$d["accounts"][0]["weightMonitor"] || $d["accounts"][0]["advancedWeightMonitor"] || count($d["products"])!==1 || $d["accounts"][0]["entries"]!==[]) exit(1);'
read_json "$temp/state" 'if($d["accounts"][0]["privacyNoticeSeen"]) exit(1);'
expect 200 "$(send "$member" "$member_token" '{"action":"acknowledgePrivacy"}')"
get "$member" api.php > "$temp/state"
read_json "$temp/state" 'if(!$d["accounts"][0]["privacyNoticeSeen"]) exit(1);'
get "$admin" api.php > "$temp/admin-state"
read_json "$temp/admin-state" 'foreach($d["accounts"] as $u) if($u["username"]==="ciadmin" && $u["privacyNoticeSeen"]) exit(1);'
expect 403 "$(send "$member" "$member_token" "{\"action\":\"weightMonitor\",\"target\":$member_id,\"on\":false}")"
expect 404 "$(send "$member" "$member_token" "{\"action\":\"saveEntry\",\"id\":\"$id\",\"type\":\"note\",\"date\":\"2020-01-01\",\"note\":\"Fixture\"}")"
expect 422 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"application","date":"2020-01-01","time":"08:00","productId":"ret-pen","amount":null}')"
expect 200 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"application","date":"2020-01-01","time":"08:00","productId":"bpc-pen","amount":null}')"
expect 200 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.37}')"
weight_id="$(read_json "$temp/response" 'echo $d["id"];')"
expect 403 "$(send "$member" "$member_token" "{\"action\":\"advancedWeightMonitor\",\"target\":$member_id,\"on\":true}")"
expect 403 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.37,"bf511":{"bodyFat":22.1}}')"
expect 200 "$(send "$admin" "$token" "{\"action\":\"advancedWeightMonitor\",\"target\":$member_id,\"on\":true}")"
monitoring_modes false true
expect 422 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.37,"bf511":{"visceralFatLevel":5.5}}')"
expect 422 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.37,"bf511":{"skeletalMuscle":60}}')"
expect 422 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.37,"bf511":{"bodyFat":22.15}}')"
expect 200 "$(send "$member" "$member_token" "{\"action\":\"saveEntry\",\"id\":\"$weight_id\",\"type\":\"weight\",\"date\":\"2020-01-01\",\"bf511\":{\"bodyFat\":22.1,\"visceralFatLevel\":8}}")"
test "$(read_json "$temp/response" 'echo $d["id"];')" = "$weight_id"
read_json "$temp/response" 'foreach($d["state"]["accounts"][0]["entries"] as $w) if($w["type"]==="weight" && $w["amount"]!==75.37) exit(1);'
expect 200 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.41}')"
read_json "$temp/response" '$u=$d["state"]["accounts"][0]; $w=array_values(array_filter($u["entries"],fn($e)=>$e["type"]==="weight"))[0]; if(count($u["entries"])!==2 || $u["weightMonitor"] || !$u["advancedWeightMonitor"] || $w["amount"]!==75.41 || $w["bf511"]!==["bodyFat"=>22.1,"visceralFatLevel"=>8]) exit(1);'
expect 200 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.41,"bf511":{"bodyFat":null,"skeletalMuscle":34.7}}')"
read_json "$temp/response" 'foreach($d["state"]["accounts"][0]["entries"] as $w) if($w["type"]==="weight" && (isset($w["bf511"]["bodyFat"]) || $w["bf511"]["skeletalMuscle"]!==34.7 || $w["bf511"]["visceralFatLevel"]!==8)) exit(1);'
expect 200 "$(send "$admin" "$token" "{\"action\":\"weightMonitor\",\"target\":$member_id,\"on\":true}")"
monitoring_modes true false
expect 200 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.42}')"
read_json "$temp/response" 'foreach($d["state"]["accounts"][0]["entries"] as $w) if(isset($w["bf511"])) exit(1);'
expect 200 "$(send "$admin" "$token" "{\"action\":\"advancedWeightMonitor\",\"target\":$member_id,\"on\":true}")"
monitoring_modes false true
expect 200 "$(send "$admin" "$token" "{\"action\":\"advancedWeightMonitor\",\"target\":$member_id,\"on\":false}")"
monitoring_modes false false
expect 403 "$(send "$member" "$member_token" '{"action":"saveEntry","type":"weight","date":"2020-01-01","amount":75.45}')"
expect 200 "$(send "$admin" "$token" "{\"action\":\"advancedWeightMonitor\",\"target\":$member_id,\"on\":true}")"
monitoring_modes false true
get "$member" api.php > "$temp/state"
read_json "$temp/state" 'foreach($d["accounts"][0]["entries"] as $w) if($w["type"]==="weight" && ($w["amount"]!==75.42 || $w["bf511"]["skeletalMuscle"]!==34.7 || $w["bf511"]["visceralFatLevel"]!==8)) exit(1);'
other_session="$temp/other-session.cookies"
login "$other_session" cimember 57962318 "$temp/other-session"
cp "$member" "$temp/old-session.cookies"
change_pin='{"action":"changePin","currentPin":"57962318","pin":"09170428","confirmation":"09170428"}'
wrong_pin='{"action":"changePin","currentPin":"000000","pin":"09170428","confirmation":"09170428"}'
expect 403 "$(send "$member" bad "$change_pin")"
expect 422 "$(send "$member" "$member_token" '{"action":"changePin","currentPin":"57962318","pin":"09170428","confirmation":"000000"}')"
expect 422 "$(send "$member" "$member_token" '{"action":"changePin","currentPin":"57962318","pin":"57962318","confirmation":"57962318"}')"
expect 403 "$(send "$member" "$member_token" "$wrong_pin")"
expect 422 "$(send "$member" "$member_token" '{"action":"changePin","currentPin":"57962318","pin":"1234","confirmation":"1234"}')"
expect 200 "$(send "$member" "$member_token" "$change_pin")"
get "$member" api.php > "$temp/after-change"
read_json "$temp/after-change" '$before=json_decode(file_get_contents(dirname($argv[1])."/state"),true); if($d["accounts"]!==$before["accounts"]) exit(1);'
expect 401 "$(curl -sS -b "$other_session" -o "$temp/response" -w '%{http_code}' "$base""api.php")"
expect 401 "$(curl -sS -b "$temp/old-session.cookies" -o "$temp/response" -w '%{http_code}' "$base""api.php")"
get "$other_session" '' > "$temp/other-session"
expect 401 "$(curl -sS -b "$other_session" --data-urlencode "csrf=$(form_token "$temp/other-session")" \
    --data-urlencode 'username=cimember' --data-urlencode 'pin=57962318' -o "$temp/response" -w '%{http_code}' "$base")"
login "$other_session" cimember 09170428 "$temp/other-session"
get "$other_session" api.php > /dev/null
for attempt in {1..12}; do
    status="$(send "$member" "$member_token" "$wrong_pin")"
    [[ "$status" == 429 ]] && break
    expect 403 "$status"
done
expect 429 "$status"
expect 200 "$(send "$admin" "$token" "{\"action\":\"setPin\",\"target\":$member_id,\"pin\":\"68120539\"}")"
expect 401 "$(curl -sS -b "$member" -o "$temp/response" -w '%{http_code}' "$base""api.php")"
php "$temp/peplog-private/bin/reports.php" --check
php "$here/tests/periods.php" "$temp/peplog-private"
echo 'Peplog smoke checks passed.'

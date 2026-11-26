<?php
declare(strict_types=1);

const LOCALES = [
    'en' => 'English', 'it' => 'Italiano', 'sl' => 'Slovenščina', 'ru' => 'Русский',
    'uk' => 'Українська', 'de' => 'Deutsch', 'es' => 'Español', 'fr' => 'Français',
    'sr-Latn' => 'Srpski', 'hr' => 'Hrvatski',
];
const ROUTES = ['pen', 'syringe', 'nasal', 'oral'];
const REPORT_TIME = '23:59';

final class RequestProblem extends RuntimeException
{
    public function __construct(public readonly int $status, string $message)
    {
        parent::__construct($message);
    }
}

function config(): array
{
    static $settings;
    if ($settings === null) {
        $file = PEPLOG_PRIVATE . '/config.php';
        if (!is_file($file)) {
            throw new RequestProblem(503, 'Server setup is incomplete.');
        }
        $settings = require $file;
    }
    return $settings;
}

function database(): PDO
{
    static $pdo;
    if ($pdo === null) {
        $options = config()['db'];
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $options['host'], $options['port'], $options['name']);
        $pdo = new PDO($dsn, $options['user'], $options['password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec("SET time_zone = '+00:00'");
    }
    return $pdo;
}

function query(PDO $db, string $sql, array $params = []): PDOStatement
{
    $statement = $db->prepare($sql);
    $statement->execute($params);
    return $statement;
}

function encode(mixed $value): string
{
    return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

function decode(string $value): array
{
    $result = json_decode($value, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($result)) {
        throw new RequestProblem(400, 'Invalid request.');
    }
    return $result;
}

function esc(string $text): string
{
    return htmlspecialchars($text, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function languages(): array
{
    static $messages;
    return $messages ??= decode(file_get_contents(PEPLOG_PRIVATE . '/locales.json'));
}

function translate(string $key, string $locale = 'en', array $arguments = []): string
{
    $translated = languages()[$locale][$key] ?? $key;
    $replacements = [];
    foreach ($arguments as $name => $value) {
        $replacements['{' . $name . '}'] = (string)$value;
    }
    return strtr($translated, $replacements);
}

function locale(): string
{
    $requested = $_GET['lang'] ?? $_POST['lang'] ?? null;
    if (is_string($requested) && isset(LOCALES[$requested])) {
        $_SESSION['login_lang'] = $requested;
        if (isset($_GET['lang'])) {
            $_SESSION['language_selected'] = true;
        }
        return $requested;
    }
    if (isset($_SESSION['login_lang'], LOCALES[$_SESSION['login_lang']])) {
        return $_SESSION['login_lang'];
    }
    foreach (explode(',', strtolower(substr($_SERVER['HTTP_ACCEPT_LANGUAGE'] ?? '', 0, 500))) as $range) {
        $base = preg_split('/[-;]/', trim($range), 2)[0];
        if ($base === 'sr') {
            return 'sr-Latn';
        }
        if (isset(LOCALES[$base])) {
            return $base;
        }
    }
    return 'en';
}

function username(string $value): string
{
    $name = strtolower(trim($value));
    if (!preg_match('/\A[a-z0-9_]{3,24}\z/', $name)) {
        throw new RequestProblem(422, 'The username must have 3–24 letters, digits, or underscores.');
    }
    return $name;
}

function pinHash(string $pin): string
{
    if (!preg_match('/\A[0-9]{6,12}\z/', $pin)) {
        throw new RequestProblem(422, 'Enter a PIN with 6–12 digits.');
    }
    return password_hash($pin, defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT);
}

function appPath(): string
{
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/peplog/index.php'));
    return rtrim($dir, '/') . '/';
}

function webSession(): void
{
    $https = in_array(strtolower((string)($_SERVER['HTTPS'] ?? '')), ['on', '1'], true)
        || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
    $test = PHP_SAPI === 'cli-server' && getenv('PEPLOG_TEST_HTTP') === '1';
    if (!$https && !$test) {
        http_response_code(403);
        exit('Open Peplog over HTTPS.');
    }
    header('Cache-Control: no-store, private');
    header('Referrer-Policy: no-referrer');
    header('Permissions-Policy: microphone=(self), camera=(), geolocation=()');
    header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'; object-src 'none'");
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.gc_maxlifetime', '7200');
    session_name('peplog_session');
    session_set_cookie_params(['path' => appPath(), 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
    session_start();
    if (isset($_SESSION['activity']) && time() - (int)$_SESSION['activity'] > 7200) {
        unset($_SESSION['user_id'], $_SESSION['auth_version'], $_SESSION['csrf'], $_SESSION['activity']);
        session_regenerate_id(true);
    }
}

function csrf(): string
{
    return $_SESSION['csrf'] ??= bin2hex(random_bytes(32));
}

function requireCsrf(mixed $token): void
{
    if (!is_string($token) || !hash_equals(csrf(), $token)) {
        throw new RequestProblem(403, 'Refresh the page and try again.');
    }
}

function loginLimit(PDO $db, string $address, string $identifier = ''): void
{
    $now = time();
    $thresholds = $identifier === '' ? ['ip:' . $address => 20] : ['user:' . $identifier => 12, 'ip:' . $address => 20];
    foreach ($thresholds as $scope => $limit) {
        $key = hash_hmac('sha256', $scope, config()['setup_key']);
        $db->beginTransaction();
        try {
            query($db, 'INSERT IGNORE INTO pl_login_limits (bucket, attempts, expires_at) VALUES (?,0,?)', [$key, $now + 900]);
            $row = query($db, 'SELECT attempts,expires_at FROM pl_login_limits WHERE bucket=? FOR UPDATE', [$key])->fetch();
            $attempts = (int)$row['expires_at'] <= $now ? 0 : (int)$row['attempts'];
            $expires = (int)$row['expires_at'] <= $now ? $now + 900 : (int)$row['expires_at'];
            if ($attempts >= $limit) {
                throw new RequestProblem(429, 'Too many attempts. Try again in 15 minutes.');
            }
            query($db, 'UPDATE pl_login_limits SET attempts=?,expires_at=? WHERE bucket=?', [$attempts + 1, $expires, $key]);
            $db->commit();
        } catch (Throwable $error) {
            $db->rollBack();
            throw $error;
        }
    }
}

function activeUser(PDO $db, bool $touch = true): ?array
{
    if (empty($_SESSION['user_id'])) {
        return null;
    }
    $row = query($db, 'SELECT * FROM pl_users WHERE id=?', [$_SESSION['user_id']])->fetch();
    if (!$row || (int)$_SESSION['auth_version'] !== (int)$row['auth_version']) {
        unset($_SESSION['user_id'], $_SESSION['auth_version'], $_SESSION['activity']);
        return null;
    }
    if ($touch) {
        $_SESSION['activity'] = time();
    }
    return $row;
}

function signInUser(PDO $db, string $name, string $pin): void
{
    $name = strtolower(trim($name));
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    loginLimit($db, $ip, $name);
    $user = query($db, 'SELECT id,pin_hash,auth_version FROM pl_users WHERE username=?', [$name])->fetch();
    $dummy = '$2y$10$uD9tk19hTlsEEwZO.iibQO8AL7KG7NLu9p7UkZZWzE0hLA043wX5S';
    $valid = password_verify($pin, $user['pin_hash'] ?? $dummy);
    if (!$valid || !$user) {
        throw new RequestProblem(401, 'Check your username and PIN.');
    }
    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$user['id'];
    $_SESSION['auth_version'] = (int)$user['auth_version'];
    $_SESSION['activity'] = time();
    unset($_SESSION['csrf']);
}

function changeOwnPin(PDO $db, array $user, array $input): void
{
    $current = textValue($input, 'currentPin', 12);
    $pin = textValue($input, 'pin', 12);
    if ($pin !== textValue($input, 'confirmation', 12)) {
        throw new RequestProblem(422, 'The new PINs must match.');
    }
    if ($pin === $current) {
        throw new RequestProblem(422, 'Choose a different PIN.');
    }

    loginLimit($db, $_SERVER['REMOTE_ADDR'] ?? 'unknown', $user['username']);
    if (!password_verify($current, $user['pin_hash'])) {
        throw new RequestProblem(403, 'Check your current PIN.');
    }
    $hash = pinHash($pin);
    if (!session_regenerate_id(true)) {
        throw new RequestProblem(503, 'The request could not be completed. Try again shortly.');
    }
    $version = (int)$user['auth_version'];
    $changed = query($db, 'UPDATE pl_users SET pin_hash=?,auth_version=auth_version+1 WHERE id=? AND auth_version=?',
        [$hash, $user['id'], $version])->rowCount();
    if ($changed !== 1) {
        throw new RequestProblem(401, 'Sign in to continue.');
    }
    $_SESSION['auth_version'] = $version + 1;
}

function signOut(): void
{
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600, 'path' => $params['path'], 'secure' => $params['secure'],
        'httponly' => true, 'samesite' => 'Strict',
    ]);
    session_destroy();
}

function keepPrivateLog(string $operation, Throwable $error): void
{
    error_log('peplog ' . $operation . ': ' . get_class($error) . ' (' . $error->getCode() . ')');
}

function textValue(array $input, string $key, int $limit): string
{
    $value = $input[$key] ?? '';
    if (!is_string($value) || mb_strlen($value) > $limit) {
        throw new RequestProblem(422, 'Check the value and try again.');
    }
    return trim($value);
}

function inTransaction(PDO $db, callable $task): mixed
{
    $db->beginTransaction();
    try {
        $result = $task();
        $db->commit();
        return $result;
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }
}

function tz(string $name): DateTimeZone
{
    if (!in_array($name, timezone_identifiers_list(), true)) {
        throw new RequestProblem(422, 'Choose a valid time zone.');
    }
    return new DateTimeZone($name);
}

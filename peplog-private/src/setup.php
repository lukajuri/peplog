<?php
declare(strict_types=1);

require PEPLOG_PRIVATE . '/src/journal.php';
webSession();
$lang = locale();
$error = '';
$completed = false;
$locked = false;
$verified = false;
$admin = 'admin';
$member = '';
try {
    $settings = config();
    $admin = username($settings['initial_admin']);
    $member = $settings['initial_user'] !== '' ? username($settings['initial_user']) : '';
    $key = $settings['setup_key'];
    if (!is_string($key) || strlen($key) < 24 || ($member !== '' && $admin === $member)) {
        throw new RequestProblem(503, 'Check the private setup configuration.');
    }
    $locked = is_file(PEPLOG_PRIVATE . '/installed.lock');
    $signature = hash_hmac('sha256', session_id(), $key);
    $verified = !$locked && (int)($_SESSION['setup_expiry'] ?? 0) >= time()
        && hash_equals($signature, $_SESSION['setup_signature'] ?? '');
    if (!$locked && $_SERVER['REQUEST_METHOD'] === 'POST') {
        requireCsrf($_POST['csrf'] ?? null);
        if (!$verified) {
            $now = time();
            if ((int)($_SESSION['setup_retry_at'] ?? 0) < $now) {
                $_SESSION['setup_attempts'] = 0;
                $_SESSION['setup_retry_at'] = $now + 900;
            }
            if ((int)$_SESSION['setup_attempts'] >= 8) {
                throw new RequestProblem(429, 'Too many attempts. Try again in 15 minutes.');
            }
            $_SESSION['setup_attempts'] += 1;
            if (!hash_equals($key, textValue($_POST, 'setup_key', 256))) {
                throw new RequestProblem(403, 'Check the setup key.');
            }
            session_regenerate_id(true);
            $_SESSION['setup_signature'] = hash_hmac('sha256', session_id(), $key);
            $_SESSION['setup_expiry'] = $now + 600;
            header('Location: setup.php', true, 303);
            exit;
        }
        $adminPin = textValue($_POST, 'admin_pin', 12);
        $memberPin = textValue($_POST, 'member_pin', 12);
        if (!preg_match('/\A[0-9]{6,12}\z/', $adminPin) || ($member !== '' && !preg_match('/\A[0-9]{6,12}\z/', $memberPin))) {
            throw new RequestProblem(422, 'Enter a PIN with 6–12 digits.');
        }
        $zone = tz($settings['timezone'])->getName();
        $db = database();
        if ((int)query($db, "SELECT GET_LOCK(CONCAT('peplog_setup_', LEFT(SHA2(DATABASE(),256),40)),5)")->fetchColumn() !== 1) {
            throw new RequestProblem(409, 'Try again shortly.');
        }
        try {
            $schema = file_get_contents(PEPLOG_PRIVATE . '/schema.sql');
            foreach (array_filter(array_map('trim', explode(';', $schema))) as $statement) {
                $db->exec($statement);
            }
            if ((int)$db->query('SELECT COUNT(*) FROM pl_users')->fetchColumn() !== 0) {
                $locked = true;
                throw new RequestProblem(409, 'Setup is already complete.');
            }
            inTransaction($db, function () use ($db, $admin, $member, $adminPin, $memberPin, $zone, $lang): void {
                $catalog = decode(file_get_contents(PEPLOG_PRIVATE . '/catalog.json'));
                $ids = [];
                foreach ($catalog as $row) {
                    query($db, 'INSERT IGNORE INTO pl_products (id,name,route,label) VALUES (?,?,?,?)', $row);
                    $ids[] = $row[0];
                }
                createUser($db, $admin, $adminPin, $zone, $lang, true, $ids);
                if ($member !== '') {
                    createUser($db, $member, $memberPin, $zone, $lang, false, []);
                }
            });
            file_put_contents(PEPLOG_PRIVATE . '/installed.lock', "installed\n", LOCK_EX);
            unset($_SESSION['setup_attempts'], $_SESSION['setup_signature'], $_SESSION['setup_expiry']);
            $completed = true;
        } finally {
            $db->query("SELECT RELEASE_LOCK(CONCAT('peplog_setup_', LEFT(SHA2(DATABASE(),256),40)))");
        }
    }
} catch (RequestProblem $problem) {
    http_response_code($problem->status);
    $error = $problem->getMessage();
} catch (Throwable $failure) {
    keepPrivateLog('setup', $failure);
    http_response_code(503);
    $error = 'Setup could not connect to the database or write its tables. Check the private configuration and database permissions.';
}
require PEPLOG_PRIVATE . '/views/setup.php';

<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

define('PEPLOG_PRIVATE', dirname(__DIR__));
require PEPLOG_PRIVATE . '/src/core.php';
require PEPLOG_PRIVATE . '/src/journal.php';
require PEPLOG_PRIVATE . '/src/services.php';
require PEPLOG_PRIVATE . '/src/reporting.php';

$lock = fopen(PEPLOG_PRIVATE . '/report-job.lock', 'c');
if (!$lock) {
    exit(1);
}
if (!flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}

try {
    $db = database();
    if (($argv[1] ?? '') === '--check') {
        $db->query('SELECT id FROM pl_users LIMIT 1');
        echo "Database and Peplog tables are reachable.\n";
        foreach (['pdo_mysql', 'curl', 'mbstring', 'openssl', 'fileinfo'] as $extension) {
            echo $extension . ': ' . (extension_loaded($extension) ? 'available' : 'missing') . "\n";
        }
        exit(0);
    }
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $db->exec('DELETE FROM pl_login_limits WHERE expires_at < UNIX_TIMESTAMP()');
    foreach ($db->query('SELECT id,locale,timezone,created_at FROM pl_users')->fetchAll() as $user) {
        queueReports($db, $user, $now);
    }
    $db->exec("UPDATE pl_reports SET mail_state='uncertain' WHERE mail_state='sending'");
    $next = $db->query("SELECT * FROM pl_reports WHERE ai_text IS NULL
        AND (next_ai_at IS NULL OR next_ai_at<=UTC_TIMESTAMP()) ORDER BY period_end,id LIMIT 8")->fetchAll();
    foreach ($next as $job) {
        processAnalysis($db, $job);
    }
    $outbox = $db->query("SELECT r.*,u.username FROM pl_reports r JOIN pl_users u ON u.id=r.user_id
        WHERE r.ai_text IS NOT NULL AND r.mail_state='pending'
        AND (r.next_mail_at IS NULL OR r.next_mail_at<=UTC_TIMESTAMP()) ORDER BY r.period_end,r.id LIMIT 8")->fetchAll();
    foreach ($outbox as $job) {
        processMail($db, $job);
    }
} catch (Throwable $error) {
    keepPrivateLog('report worker', $error);
    exit(1);
} finally {
    fclose($lock);
}

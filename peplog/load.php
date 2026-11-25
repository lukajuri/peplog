<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('X-Content-Type-Options: nosniff');

$configured = getenv('PEPLOG_PRIVATE_DIR');
$root = is_string($configured) && $configured !== '' ? realpath($configured) : false;
if (!$root) {
    $dir = dirname(__DIR__);
    while ($dir !== dirname($dir)) {
        $candidate = $dir . '/peplog-private';
        if (is_file($candidate . '/src/core.php')) {
            $root = realpath($candidate);
            break;
        }
        $dir = dirname($dir);
    }
}

if (!$root || !is_file($root . '/src/core.php')) {
    http_response_code(503);
    header('Cache-Control: no-store');
    exit('Peplog setup is incomplete.');
}

$documentRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
if ($documentRoot && ($root === $documentRoot || str_starts_with($root, $documentRoot . '/'))) {
    http_response_code(503);
    exit('Move peplog-private outside the web document root.');
}

define('PEPLOG_PRIVATE', $root);
require $root . '/src/core.php';

<?php
declare(strict_types=1);

$config = require __DIR__ . '/../peplog-private/config.example.php';
$config['db'] = [
    'host' => '127.0.0.1', 'port' => 3306, 'name' => 'peplog_check', 'user' => 'peplog_check',
    'password' => 'ci-database-fixture',
];
$config['setup_key'] = 'automated-check-install-fixture';
$config['initial_admin'] = 'ciadmin';
$config['initial_user'] = 'cimember';
$config['report_recipient'] = 'reports@example.test';
echo '<?php return ' . var_export($config, true) . ';';

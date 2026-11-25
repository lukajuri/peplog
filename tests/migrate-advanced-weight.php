<?php
declare(strict_types=1);

define('PEPLOG_PRIVATE', $argv[1]);
require PEPLOG_PRIVATE . '/src/core.php';

$db = database();
$usersBefore = $db->query('SELECT * FROM pl_users ORDER BY id')->fetchAll();
if (count($usersBefore) !== 2 || isset($usersBefore[0]['advanced_weight_monitor'])) {
    throw new RuntimeException('Expected two users in the original installation schema.');
}
$fixture = ['date' => '2020-01-01', 'type' => 'weight', 'amount' => 78.4, 'note' => 'Prior weigh-in'];
query($db, 'INSERT INTO pl_entries (id,user_id,entry_date,weight_date,payload) VALUES (?,?,?,?,?)',
    ['111111111111111111111111', $usersBefore[0]['id'], $fixture['date'], $fixture['date'], encode($fixture)]);
$entriesBefore = $db->query('SELECT * FROM pl_entries ORDER BY id')->fetchAll();

$migration = file_get_contents(PEPLOG_PRIVATE . '/migrations/001_advanced_weight_monitor.sql');
$db->exec($migration);

$usersAfter = $db->query('SELECT * FROM pl_users ORDER BY id')->fetchAll();
foreach ($usersAfter as &$user) {
    if ((int)$user['advanced_weight_monitor'] !== 0) {
        throw new RuntimeException('Advanced monitoring must default to off.');
    }
    unset($user['advanced_weight_monitor']);
}
unset($user);
if ($usersAfter !== $usersBefore || $db->query('SELECT * FROM pl_entries ORDER BY id')->fetchAll() !== $entriesBefore) {
    throw new RuntimeException('The migration changed an existing user or log.');
}
echo "Verified the database upgrade preserved both users, their PIN hashes and the existing weigh-in.\n";

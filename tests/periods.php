<?php
declare(strict_types=1);

define('PEPLOG_PRIVATE', $argv[1]);
require PEPLOG_PRIVATE . '/src/core.php';
require PEPLOG_PRIVATE . '/src/journal.php';
require PEPLOG_PRIVATE . '/src/reporting.php';

function must(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

$zone = new DateTimeZone('Europe/Ljubljana');
$day = new DateTimeImmutable('2028-02-27 23:58:00', $zone);
must(reportEnd('weekly', $day)->format('Y-m-d H:i') === '2028-02-27 23:59', 'Sunday boundary');
must(reportEnd('monthly', $day)->format('Y-m-d H:i') === '2028-02-29 23:59', 'Leap-year month boundary');
must(reportStart('weekly', reportEnd('weekly', $day))->format('Y-m-d') === '2028-02-21', 'Monday start');
must(reportEnd('weekly', new DateTimeImmutable('2027-01-01', $zone))->format('Y-m-d') === '2027-01-03', 'Year crossover');
must(reportEnd('weekly', new DateTimeImmutable('2026-03-29', $zone))->format('P') === '+02:00', 'Daylight savings');

$db = database();
$user = query($db, 'SELECT * FROM pl_users WHERE username=?', ['cimember'])->fetch();
$user['created_at'] = '2027-02-25 12:00:00';
$before = new DateTimeImmutable('2027-02-28 23:58', $zone);
$at = $before->modify('+1 minute');
queueReports($db, $user, $before);
must((int)$db->query('SELECT COUNT(*) FROM pl_reports')->fetchColumn() === 0, 'Report created before cutoff');
queueReports($db, $user, $at);
queueReports($db, $user, $at);
must((int)$db->query('SELECT COUNT(*) FROM pl_reports')->fetchColumn() === 2, 'Month-end Sunday must create one of each report');
must(savedReport($db, $user, 'weekly', '2027-02-28') !== null, 'Weekly report missing for owner');
$other = query($db, 'SELECT * FROM pl_users WHERE username=?', ['ciadmin'])->fetch();
must(savedReport($db, $other, 'weekly', '2027-02-28') === null, 'Another account can see this report');
foreach (array_keys(LOCALES) as $locale) {
    must($locale === 'en' || count(languages()[$locale]) >= 200, 'Missing language catalog: ' . $locale);
}
echo "Verified reporting cutoffs, duplicate prevention, report ownership, and all language catalogs.\n";

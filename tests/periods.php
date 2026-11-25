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
$fixtures = [
    ['2027-02-10', 75.85, ['bodyFat' => 23.0]],
    ['2027-02-25', 75.53, ['bodyFat' => 22.4, 'visceralFatLevel' => 8]],
    ['2027-02-28', 75.31, ['bodyFat' => 21.8, 'skeletalMuscle' => 36.8, 'visceralFatLevel' => 7]],
];
foreach ($fixtures as [$date, $weight, $readings]) {
    query($db, 'INSERT INTO pl_entries (id,user_id,entry_date,weight_date,payload) VALUES (?,?,?,?,?)',
        [bin2hex(random_bytes(12)), $user['id'], $date, $date,
            encode(['date' => $date, 'type' => 'weight', 'amount' => $weight, 'note' => '', 'bf511' => $readings])]);
}
must($user['advanced_weight_monitor'] && !$user['weight_monitor'], 'Advanced reporting must work by itself');
$legacyFlags = publicUser(array_replace($user, ['weight_monitor' => 1]), []);
must(!$legacyFlags['weightMonitor'] && $legacyFlags['advancedWeightMonitor'], 'Advanced monitoring must take precedence for old dual settings');
queueReports($db, $user, $before);
must((int)$db->query('SELECT COUNT(*) FROM pl_reports')->fetchColumn() === 0, 'Report created before cutoff');
queueReports($db, $user, $at);
queueReports($db, $user, $at);
must((int)$db->query('SELECT COUNT(*) FROM pl_reports')->fetchColumn() === 2, 'Month-end Sunday must create one of each report');
$week = savedReport($db, $user, 'weekly', '2027-02-28')['data'];
$month = savedReport($db, $user, 'monthly', '2027-02-28')['data'];
must(count($week['bf511']['bodyFat']['readings']) === 2, 'Weekly report contains a reading outside its period');
must(count($month['bf511']['bodyFat']['readings']) === 3, 'Monthly report is missing a reading');
must($week['bf511']['bodyFat']['change'] === -0.6, 'Wrong weekly body fat change');
must($month['bf511']['bodyFat']['change'] === -1.2, 'Wrong monthly body fat change');
must($week['bf511']['skeletalMuscle']['change'] === null, 'A single reading cannot have a change');
$email = reportBody($week, 'Fixture analysis.', $user['username']);
must(str_contains($email, '22/02/2027 – 28/02/2027'), 'English email dates must be day-first');
must(str_contains($email, '25/02/2027 · 22.4%') && str_contains($email, 'Recorded change · -0.6 percentage points'), 'Weekly email missing readings and percentage-point change');
must(str_contains($email, "Visceral fat level — 25/02/2027 · 8 | 28/02/2027 · 7\nRecorded change · -1\n"), 'Visceral fat must use levels');
must(str_contains(reportBody($month, 'Fixture analysis.', $user['username']), '10/02/2027 · 23.0%'), 'Monthly email missing the earlier reading');
$user['advanced_weight_monitor'] = 0;
must(reportSnapshot($db, $user, 'weekly', $at)['bf511'] === [], 'A disabled user was included in the advanced report');
unset($week['bf511']);
must(!str_contains(reportBody($week, 'Fixture analysis.', $user['username']), 'BF511 readings'), 'Legacy reports should render without BF511 data');
$other = query($db, 'SELECT * FROM pl_users WHERE username=?', ['ciadmin'])->fetch();
must(savedReport($db, $other, 'weekly', '2027-02-28') === null, 'Another account can see this report');
foreach (array_keys(LOCALES) as $locale) {
    must($locale === 'en' || count(languages()[$locale]) >= 200, 'Missing language catalog: ' . $locale);
}
echo "Verified reporting cutoffs, duplicate prevention, report ownership, and all language catalogs.\n";

<?php
declare(strict_types=1);

function reportEnd(string $kind, DateTimeImmutable $day): DateTimeImmutable
{
    return match ($kind) {
        'weekly' => $day->modify('+' . (7 - (int)$day->format('N')) . ' days')->setTime(23, 59),
        'monthly' => $day->modify('last day of this month')->setTime(23, 59),
    };
}

function reportStart(string $kind, DateTimeImmutable $end): DateTimeImmutable
{
    return $kind === 'weekly' ? $end->modify('-6 days') : $end->modify('first day of this month');
}

function reportSnapshot(PDO $db, array $user, string $kind, DateTimeImmutable $end): array
{
    $start = reportStart($kind, $end);
    $from = $start->format('Y-m-d');
    $to = $end->format('Y-m-d');
    $listed = entries($db, (int)$user['id'], $from, $to);
    $days = [];
    $weights = [];
    $bf511Readings = [];
    $applications = [];
    $notes = [];
    foreach ($listed as $entry) {
        $days[$entry['date']] = true;
        if ($entry['type'] === 'weight') {
            $weights[] = ['date' => $entry['date'], 'kg' => $entry['amount']];
            if (!empty($user['advanced_weight_monitor'])) {
                foreach (BF511_METRICS as $name => $metric) {
                    if (isset($entry['bf511'][$name])) {
                        $bf511Readings[$name][] = ['date' => $entry['date'], 'value' => $entry['bf511'][$name]];
                    }
                }
            }
        }
        if ($entry['type'] === 'application') {
            $applications[] = [
                'date' => $entry['date'], 'time' => $entry['time'], 'product' => $entry['snapshot']['name'],
                'method' => $entry['route'], 'reported_amount' => $entry['amount'], 'unit' => $entry['unit'],
            ];
        }
        if ($entry['note'] !== '') {
            $notes[] = ['date' => $entry['date'], 'time' => $entry['time'] ?? null, 'note' => $entry['note']];
        }
    }
    $composition = [];
    foreach ($bf511Readings as $name => $readings) {
        $composition[$name] = [
            'readings' => $readings,
            'change' => count($readings) > 1
                ? round($readings[count($readings) - 1]['value'] - $readings[0]['value'], BF511_METRICS[$name]['decimals'])
                : null,
        ];
    }
    return [
        'period' => $kind, 'from' => $from, 'to' => $to, 'time_zone' => $user['timezone'], 'locale' => $user['locale'],
        'days_logged' => count($days), 'days_total' => $start->diff($end)->days + 1,
        'application_count' => count($applications), 'note_count' => count($notes), 'weight_count' => count($weights),
        'weights' => $weights, 'bf511' => $composition, 'applications' => $applications, 'notes' => $notes,
    ];
}

function queueReports(PDO $db, array $user, DateTimeImmutable $now): void
{
    $zone = tz($user['timezone']);
    $localNow = $now->setTimezone($zone);
    $created = (new DateTimeImmutable($user['created_at'], new DateTimeZone('UTC')))->setTimezone($zone);
    foreach (['weekly', 'monthly'] as $kind) {
        $last = query($db, 'SELECT MAX(period_end) FROM pl_reports WHERE user_id=? AND kind=?', [$user['id'], $kind])->fetchColumn();
        $cursor = $last ? (new DateTimeImmutable($last, $zone))->modify('+1 day') : $created;
        for ($i = 0; $i < 12; ++$i) {
            $end = reportEnd($kind, $cursor);
            if ($end > $localNow) {
                break;
            }
            $cursor = $end->modify('+1 day');
            if ($end < $created) {
                continue;
            }
            $data = reportSnapshot($db, $user, $kind, $end);
            query($db, 'INSERT IGNORE INTO pl_reports (user_id,kind,period_start,period_end,payload) VALUES (?,?,?,?,?)',
                [$user['id'], $kind, $data['from'], $data['to'], encode($data)]);
        }
    }
}

function reportTitle(string $kind): string
{
    return $kind === 'weekly' ? 'Weekly journal summary' : 'Monthly journal summary';
}

function reportDate(string $date, string $locale): string
{
    return $locale === 'en' ? implode('/', array_reverse(explode('-', $date))) : $date;
}

function reportBf511Text(array $composition, string $locale): string
{
    if (!$composition) {
        return '';
    }
    $lines = [translate('BF511 readings', $locale)];
    $decimal = $locale === 'en' ? '.' : ',';
    foreach (BF511_METRICS as $name => $metric) {
        $summary = $composition[$name] ?? null;
        if (!$summary || !$summary['readings']) {
            continue;
        }
        $readings = array_map(
            fn(array $row): string => reportDate($row['date'], $locale) . ' · '
                . number_format($row['value'], $metric['decimals'], $decimal, '') . $metric['unit'],
            $summary['readings']
        );
        $lines[] = translate($metric['label'], $locale) . ' — ' . implode(' | ', $readings);
        if ($summary['change'] !== null) {
            $change = ($summary['change'] > 0 ? '+' : '')
                . number_format($summary['change'], $metric['decimals'], $decimal, '');
            if ($metric['unit'] === '%') {
                $change .= ' ' . translate('percentage points', $locale);
            }
            $lines[] = translate('Recorded change', $locale) . ' · ' . $change;
        }
    }
    return "\n\n" . implode("\n", $lines);
}

function reportBody(array $data, string $analysis, string $username): string
{
    $locale = $data['locale'];
    $first = $data['weights'][0] ?? null;
    $last = $data['weights'] ? $data['weights'][count($data['weights']) - 1] : null;
    $facts = translate('{days} of {total} days had entries. Applications: {applications}. Observations: {notes}.', $locale, [
        'days' => $data['days_logged'], 'total' => $data['days_total'], 'applications' => $data['application_count'], 'notes' => $data['note_count'],
    ]);
    if ($data['weight_count'] > 1) {
        $change = round($last['kg'] - $first['kg'], 2);
        $facts .= "\n" . translate('The first weight was {first} and the latest was {last} (change {change}).', $locale, [
            'first' => $first['kg'] . ' kg', 'last' => $last['kg'] . ' kg', 'change' => ($change > 0 ? '+' : '') . $change . ' kg',
        ]);
    } elseif ($first) {
        $facts .= "\n" . translate('One weight measurement was recorded ({weight}).', $locale, ['weight' => $first['kg'] . ' kg']);
    }
    return translate('Account holder', $locale) . '  ' . $username . "\n"
        . reportDate($data['from'], $locale) . ' – ' . reportDate($data['to'], $locale)
        . ' (' . $data['time_zone'] . ")\n\n"
        . $facts . reportBf511Text($data['bf511'] ?? [], $locale)
        . "\n\n" . translate('AI analysis', $locale) . "\n" . $analysis . "\n";
}

function processAnalysis(PDO $db, array $job): void
{
    $report = decode($job['payload']);
    try {
        if ($report['days_logged'] === 0) {
            $analysis = translate('No entries were logged in this period.', $report['locale']);
        } else {
            $input = $report;
            $input['notes'] = array_slice($input['notes'], -100);
            foreach ($input['notes'] as &$note) {
                $note['note'] = mb_substr($note['note'], 0, 500);
            }
            unset($note);
            $input['applications'] = array_slice($input['applications'], -200);
            $analysis = analyzeReport($input, $report['locale']);
        }
        query($db, 'UPDATE pl_reports SET ai_text=?,next_ai_at=NULL WHERE id=?', [$analysis, $job['id']]);
    } catch (Throwable $error) {
        keepPrivateLog('report analysis', $error);
        $wait = min(21600, 120 * 2 ** min(8, (int)$job['ai_attempts']));
        query($db, 'UPDATE pl_reports SET ai_attempts=LEAST(ai_attempts+1,65000),next_ai_at=? WHERE id=?',
            [gmdate('Y-m-d H:i:s', time() + $wait), $job['id']]);
    }
}

function processMail(PDO $db, array $job): void
{
    $data = decode($job['payload']);
    try {
        $title = translate(reportTitle($job['kind']), $data['locale']) . ' ' . reportDate($job['period_end'], $data['locale']);
        $body = reportBody($data, $job['ai_text'], $job['username']);
        $mailId = 'peplog-' . hash('sha256', config()['setup_key'] . ':' . $job['id']);
        smtpSend(config()['report_recipient'], $title, $body, $mailId, function () use ($db, $job): void {
            query($db, "UPDATE pl_reports SET mail_state='sending' WHERE id=?", [$job['id']]);
        });
        query($db, "UPDATE pl_reports SET mail_state='sent',sent_at=UTC_TIMESTAMP(),next_mail_at=NULL WHERE id=?", [$job['id']]);
    } catch (Throwable $error) {
        keepPrivateLog('report mail', $error);
        $wait = min(21600, 120 * 2 ** min(8, (int)$job['mail_attempts']));
        query($db, "UPDATE pl_reports SET mail_attempts=LEAST(mail_attempts+1,65000),next_mail_at=? WHERE id=? AND mail_state='pending'",
            [gmdate('Y-m-d H:i:s', time() + $wait), $job['id']]);
    }
}

function savedReport(PDO $db, array $user, string $kind, string $end): ?array
{
    if (!in_array($kind, ['weekly', 'monthly'], true) || !validDate($end)) {
        throw new RequestProblem(422, 'Invalid request.');
    }
    $report = query($db, 'SELECT payload,ai_text,mail_state,sent_at FROM pl_reports WHERE user_id=? AND kind=? AND period_end=?',
        [$user['id'], $kind, $end])->fetch();
    if (!$report) {
        return null;
    }
    return ['data' => decode($report['payload']), 'analysis' => $report['ai_text'],
        'mailState' => $report['mail_state'], 'sentAt' => $report['sent_at']];
}

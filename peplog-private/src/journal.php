<?php
declare(strict_types=1);

const BF511_METRICS = [
    'bodyFat' => ['label' => 'Body fat (%)', 'min' => 5, 'max' => 60, 'decimals' => 1, 'unit' => '%'],
    'skeletalMuscle' => ['label' => 'Skeletal muscle (%)', 'min' => 5, 'max' => 50, 'decimals' => 1, 'unit' => '%'],
    'visceralFatLevel' => ['label' => 'Visceral fat level', 'min' => 1, 'max' => 30, 'decimals' => 0, 'unit' => ''],
];

function createUser(PDO $db, string $name, string $secret, string $zone, string $locale, bool $admin, array $products): int
{
    $hash = pinHash($secret);
    try {
        query($db, 'INSERT INTO pl_users (username,pin_hash,is_admin,timezone,locale) VALUES (?,?,?,?,?)',
            [username($name), $hash, $admin ? 1 : 0, $zone, $locale]);
    } catch (PDOException $error) {
        if ((int)($error->errorInfo[1] ?? 0) === 1062) {
            throw new RequestProblem(409, 'That username is already in use.');
        }
        throw $error;
    }
    $id = (int)$db->lastInsertId();
    foreach (array_unique($products) as $product) {
        query($db, 'INSERT INTO pl_user_products (user_id,product_id) SELECT ?,id FROM pl_products WHERE id=?', [$id, $product]);
    }
    return $id;
}

function publicUser(array $user, array $grants): array
{
    return [
        'id' => (int)$user['id'],
        'username' => $user['username'], 'display' => $user['username'],
        'admin' => (bool)$user['is_admin'],
        'weightMonitor' => (bool)$user['weight_monitor'],
        'advancedWeightMonitor' => (bool)$user['advanced_weight_monitor'],
        'visible' => $grants,
        'prefs' => [
            'lang' => $user['locale'], 'timeZone' => $user['timezone'], 'theme' => $user['theme'],
            'weigh' => (bool)$user['weigh_reminder'],
        ],
    ];
}

function entries(PDO $db, int $userId, ?string $start = null, ?string $end = null): array
{
    $sql = 'SELECT id,payload,updated_at FROM pl_entries WHERE user_id=?';
    $args = [$userId];
    if ($start !== null && $end !== null) {
        $sql .= ' AND entry_date BETWEEN ? AND ?';
        array_push($args, $start, $end);
    }
    return array_map(static function (array $row): array {
        return decode($row['payload']) + [
            'id' => $row['id'],
            'savedAt' => (new DateTimeImmutable($row['updated_at'], new DateTimeZone('UTC')))->format('Uv'),
        ];
    }, query($db, $sql . ' ORDER BY entry_date,entry_time,id', $args)->fetchAll());
}

function hydrate(PDO $db, array $user, bool $withLanguages = false): array
{
    $id = (int)$user['id'];
    $admin = (bool)$user['is_admin'];
    $users = $admin ? $db->query('SELECT * FROM pl_users ORDER BY username')->fetchAll() : [$user];
    $grantRows = query($db, 'SELECT user_id,product_id FROM pl_user_products' . ($admin ? '' : ' WHERE user_id=?'),
        $admin ? [] : [$id])->fetchAll();
    $grants = [];
    foreach ($grantRows as $row) {
        $grants[(int)$row['user_id']][] = $row['product_id'];
    }
    $available = $admin
        ? $db->query('SELECT id,name,route,label FROM pl_products ORDER BY created_at,id')->fetchAll()
        : query($db, 'SELECT p.id,p.name,p.route,p.label FROM pl_products p JOIN pl_user_products up ON up.product_id=p.id WHERE up.user_id=? ORDER BY p.created_at,p.id', [$id])->fetchAll();

    $records = $admin
        ? array_map(fn(array $row): array => publicUser($row, $grants[(int)$row['id']] ?? []), $users)
        : [publicUser($user, $grants[$id] ?? [])];
    foreach ($records as &$record) {
        if ($record['id'] === $id) {
            $record['entries'] = entries($db, $id);
            if (!$record['advancedWeightMonitor']) {
                foreach ($record['entries'] as &$entry) {
                    unset($entry['bf511']);
                }
                unset($entry);
            }
        }
    }
    unset($record);
    $result = ['user' => $user['username'], 'accounts' => $records, 'products' => $available];
    if ($withLanguages) {
        $result['locales'] = LOCALES;
        $result['messages'] = languages();
        $result['reportRecipient'] = (string)config()['report_recipient'];
        $result['bf511Metrics'] = BF511_METRICS;
    }
    return $result;
}

function validDate(string $date): bool
{
    return preg_match('/\A([0-9]{4})-([0-9]{2})-([0-9]{2})\z/', $date, $p) === 1
        && (int)$p[1] >= 1000 && checkdate((int)$p[2], (int)$p[3], (int)$p[1]);
}

function positiveNumber(mixed $value, float $max = 10000000): float
{
    if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value) || $value <= 0 || $value > $max) {
        throw new RequestProblem(422, 'Enter a positive number within the permitted range.');
    }
    return (float)$value;
}

function applicationData(PDO $db, int $owner, array $input, ?array $existing): array
{
    $productId = textValue($input, 'productId', 48);
    $product = query($db, 'SELECT p.id,p.name,p.route,p.label FROM pl_products p
        JOIN pl_user_products up ON up.product_id=p.id WHERE p.id=? AND up.user_id=?', [$productId, $owner])->fetch();
    if (!$product && $existing && ($existing['productId'] ?? null) === $productId) {
        $product = $existing['snapshot'];
    }
    if (!$product) {
        throw new RequestProblem(422, 'Select a product');
    }
    $route = $product['route'];
    $time = textValue($input, 'time', 5);
    if (!preg_match('/\A(?:[01][0-9]|2[0-3]):[0-5][0-9]\z/', $time)) {
        throw new RequestProblem(422, 'Choose a valid time.');
    }
    $raw = $input['amount'] ?? null;
    $amount = $raw === null && in_array($route, ['pen', 'syringe'], true) ? null : positiveNumber($raw);
    $unit = match ($route) {
        'pen' => 'clicks', 'nasal' => 'sprays', 'syringe' => 'mg', default => textValue($input, 'unit', 12),
    };
    if (in_array($route, ['pen', 'nasal'], true) && $amount !== null && floor($amount) !== $amount) {
        throw new RequestProblem(422, 'Enter a whole number.');
    }
    if ($route === 'oral' && !in_array($unit, ['mg', 'µg', 'mL', 'units', 'capsules'], true)) {
        throw new RequestProblem(422, 'Choose a value');
    }
    $data = ['time' => $time, 'productId' => $productId, 'snapshot' => $product, 'route' => $route, 'amount' => $amount, 'unit' => $unit];
    if ($route === 'nasal') {
        $data['mass'] = positiveNumber($input['mass'] ?? null);
        $data['volume'] = positiveNumber($input['volume'] ?? null);
    }
    return $data;
}

function updateBf511(array $saved, mixed $changes): array
{
    if (!is_array($changes)) {
        throw new RequestProblem(422, 'Invalid request.');
    }
    foreach ($changes as $name => $value) {
        $metric = BF511_METRICS[$name] ?? null;
        if ($metric === null) {
            throw new RequestProblem(422, 'Invalid request.');
        }
        if ($value === null) {
            unset($saved[$name]);
            continue;
        }
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value)
            || $value < $metric['min'] || $value > $metric['max']
            || abs($value - round($value, $metric['decimals'])) > 0.00000001) {
            throw new RequestProblem(422, 'Check the BF511 reading ranges and decimal places.');
        }
        $saved[$name] = $metric['decimals'] === 0 ? (int)$value : round($value, $metric['decimals']);
    }
    return $saved;
}

function saveJournalEntry(PDO $db, array $user, array $input): string
{
    $userId = (int)$user['id'];
    $date = textValue($input, 'date', 10);
    $type = textValue($input, 'type', 15);
    $note = textValue($input, 'note', 2000);
    if (!validDate($date) || $date > (new DateTimeImmutable('now', tz($user['timezone'])))->format('Y-m-d')) {
        throw new RequestProblem(422, 'Choose today or an earlier date.');
    }
    if (!in_array($type, ['weight', 'note', 'application'], true)) {
        throw new RequestProblem(422, 'Invalid request.');
    }
    $hasBf511 = array_key_exists('bf511', $input);
    if ($hasBf511 && $type !== 'weight') {
        throw new RequestProblem(422, 'Invalid request.');
    }
    if ($type === 'note' && $note === '') {
        throw new RequestProblem(422, 'Enter your observation.');
    }
    $existingId = textValue($input, 'id', 24);
    return inTransaction($db, function () use ($db, $userId, $date, $type, $note, $existingId, $input, $hasBf511): string {
        $hasPermission = query($db, 'SELECT advanced_weight_monitor FROM pl_users WHERE id=? FOR UPDATE', [$userId])->fetchColumn();
        if ($hasBf511 && !$hasPermission) {
            throw new RequestProblem(403, 'Access denied.');
        }
        $existing = $existingId === '' ? null
            : query($db, 'SELECT payload FROM pl_entries WHERE id=? AND user_id=?', [$existingId, $userId])->fetch();
        if ($existingId !== '' && !$existing) {
            throw new RequestProblem(404, 'Entry not found.');
        }
        $data = ['date' => $date, 'type' => $type, 'note' => $note];
        $weightDate = null;
        if ($type === 'application') {
            $data += applicationData($db, $userId, $input, $existing ? decode($existing['payload']) : null);
        } elseif ($type === 'weight') {
            $data['amount'] = round(positiveNumber($input['amount'] ?? null, 500.99), 2);
            if ($data['amount'] <= 0) {
                throw new RequestProblem(422, 'Choose a weight greater than zero.');
            }
            $weightDate = $date;
            $sameDay = query($db, 'SELECT id,payload FROM pl_entries WHERE user_id=? AND weight_date=?', [$userId, $date])->fetch();
            if ($sameDay && $existingId !== '' && $existingId !== $sameDay['id']) {
                throw new RequestProblem(409, 'A weight entry already exists for this date.');
            }
            $existingId = $existingId !== '' ? $existingId : ($sameDay['id'] ?? '');
            $stored = $existing ?: $sameDay;
            $previous = $stored ? decode($stored['payload']) : [];
            $readings = $previous['bf511'] ?? [];
            if ($hasBf511) {
                $readings = updateBf511($readings, $input['bf511']);
            }
            if ($readings !== []) {
                $data['bf511'] = $readings;
            }
            if (!array_key_exists('note', $input) && isset($previous['note'])) {
                $data['note'] = $previous['note'];
            }
        }

        if ($existingId !== '') {
            query($db, 'UPDATE pl_entries SET entry_date=?,entry_time=?,weight_date=?,payload=?,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND user_id=?',
                [$date, $data['time'] ?? null, $weightDate, encode($data), $existingId, $userId]);
            return $existingId;
        }
        $id = bin2hex(random_bytes(12));
        query($db, 'INSERT INTO pl_entries (id,user_id,entry_date,entry_time,weight_date,payload) VALUES (?,?,?,?,?,?)',
            [$id, $userId, $date, $data['time'] ?? null, $weightDate, encode($data)]);
        return $id;
    });
}

function savePreferences(PDO $db, array $user, array $input): void
{
    $locale = textValue($input, 'lang', 12);
    $timeZone = tz(textValue($input, 'timeZone', 64))->getName();
    $theme = textValue($input, 'theme', 8);
    if (!isset(LOCALES[$locale]) || !in_array($theme, ['light', 'dark'], true)) {
        throw new RequestProblem(422, 'Invalid request.');
    }
    query($db, 'UPDATE pl_users SET locale=?,timezone=?,theme=?,weigh_reminder=? WHERE id=?',
        [$locale, $timeZone, $theme, !empty($input['weigh']) ? 1 : 0, $user['id']]);
}

function adminAction(PDO $db, array $actor, string $action, array $input): void
{
    if (!$actor['is_admin']) {
        throw new RequestProblem(403, 'Access denied.');
    }
    if ($action === 'addUser') {
        $selected = $input['products'] ?? [];
        if (!is_array($selected) || count($selected) > 300 || array_filter($selected, fn($id) => !is_string($id))) {
            throw new RequestProblem(422, 'Invalid request.');
        }
        inTransaction($db, fn() => createUser($db, textValue($input, 'username', 24), textValue($input, 'pin', 12),
            $actor['timezone'], $actor['locale'], false, $selected));
        return;
    }
    $target = query($db, 'SELECT id FROM pl_users WHERE id=?', [(int)($input['target'] ?? 0)])->fetchColumn();
    if (!$target) {
        throw new RequestProblem(404, 'User not found.');
    }
    switch ($action) {
        case 'setPin':
            $hash = pinHash(textValue($input, 'pin', 12));
            query($db, 'UPDATE pl_users SET pin_hash=?,auth_version=auth_version+1 WHERE id=?', [$hash, $target]);
            if ((int)$target === (int)$actor['id']) {
                $_SESSION['auth_version'] = (int)query($db, 'SELECT auth_version FROM pl_users WHERE id=?', [$target])->fetchColumn();
            }
            break;
        case 'weightMonitor':
            query($db, 'UPDATE pl_users SET weight_monitor=? WHERE id=?', [!empty($input['on']) ? 1 : 0, $target]);
            break;
        case 'advancedWeightMonitor':
            query($db, 'UPDATE pl_users SET advanced_weight_monitor=? WHERE id=?', [!empty($input['on']) ? 1 : 0, $target]);
            break;
        case 'grantProduct':
            $product = textValue($input, 'product', 48);
            if (!empty($input['on'])) {
                query($db, 'INSERT IGNORE INTO pl_user_products (user_id,product_id)
                    SELECT ?,id FROM pl_products WHERE id=?', [$target, $product]);
            } else {
                query($db, 'DELETE FROM pl_user_products WHERE user_id=? AND product_id=?', [$target, $product]);
            }
            break;
        case 'addProduct':
            $route = textValue($input, 'route', 10);
            $name = textValue($input, 'name', 90);
            $label = textValue($input, 'label', 50);
            if ($name === '' || !in_array($route, ROUTES, true)) {
                throw new RequestProblem(422, 'Enter a product name and method.');
            }
            $id = 'product-' . bin2hex(random_bytes(12));
            inTransaction($db, function () use ($db, $id, $name, $route, $label, $target, $input): void {
                query($db, 'INSERT INTO pl_products (id,name,route,label) VALUES (?,?,?,?)', [$id, $name, $route, $label]);
                if (!empty($input['on'])) {
                    query($db, 'INSERT INTO pl_user_products (user_id,product_id) VALUES (?,?)', [$target, $id]);
                }
            });
            break;
    }
}

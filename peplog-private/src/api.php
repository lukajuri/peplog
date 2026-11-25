<?php
declare(strict_types=1);

require PEPLOG_PRIVATE . '/src/journal.php';
require PEPLOG_PRIVATE . '/src/services.php';
require PEPLOG_PRIVATE . '/src/reporting.php';

webSession();
header('Content-Type: application/json; charset=utf-8');
try {
    $db = database();
    $user = activeUser($db, false);
    if (!$user) {
        throw new RequestProblem(401, 'Sign in to continue.');
    }
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $_SESSION['activity'] = time();
        echo encode(hydrate($db, $user, true));
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        throw new RequestProblem(405, 'Invalid request.');
    }
    requireCsrf($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
    if (str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data')) {
        if (($_POST['action'] ?? '') !== 'transcribe') {
            throw new RequestProblem(400, 'Invalid request.');
        }
        $_SESSION['activity'] = time();
        session_write_close();
        echo encode(['transcript' => transcribe($_FILES['audio'] ?? [])]);
        exit;
    }
    $raw = file_get_contents('php://input', false, null, 0, 65537);
    if (!is_string($raw) || strlen($raw) > 65536) {
        throw new RequestProblem(400, 'Invalid request.');
    }
    try {
        $input = decode($raw);
    } catch (JsonException) {
        throw new RequestProblem(400, 'Invalid request.');
    }
    $action = textValue($input, 'action', 30);
    switch ($action) {
        case 'saveEntry':
            $id = saveJournalEntry($db, $user, $input);
            break;
        case 'removeEntry':
            query($db, 'DELETE FROM pl_entries WHERE id=? AND user_id=?', [textValue($input, 'id', 24), $user['id']]);
            break;
        case 'preferences':
            savePreferences($db, $user, $input);
            break;
        case 'addUser':
        case 'setPin':
        case 'weightMonitor':
        case 'grantProduct':
        case 'addProduct':
            adminAction($db, $user, $action, $input);
            break;
        case 'report':
            echo encode(['report' => savedReport($db, $user, textValue($input, 'kind', 10), textValue($input, 'end', 10))]);
            exit;
        default:
            throw new RequestProblem(400, 'Invalid request.');
    }
    echo encode(['state' => hydrate($db, activeUser($db) ?? $user)] + (isset($id) ? ['id' => $id] : []));
} catch (RequestProblem $problem) {
    http_response_code($problem->status);
    echo encode(['error' => $problem->getMessage()]);
} catch (Throwable $error) {
    keepPrivateLog('api', $error);
    http_response_code(503);
    echo encode(['error' => 'The request could not be completed. Try again shortly.']);
}

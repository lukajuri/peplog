<?php
declare(strict_types=1);

webSession();
$lang = locale();
$error = '';
$user = null;

try {
    $db = database();
    $user = activeUser($db);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        requireCsrf($_POST['csrf'] ?? null);
        if (($_POST['action'] ?? '') === 'signout') {
            signOut();
        } elseif (!$user) {
            signInUser($db, textValue($_POST, 'username', 24), textValue($_POST, 'pin', 12));
            $user = activeUser($db);
            if ($user && !empty($_SESSION['language_selected'])) {
                query($db, 'UPDATE pl_users SET locale=? WHERE id=?', [$lang, $user['id']]);
                unset($_SESSION['language_selected']);
            }
        }
        header('Location: ./', true, 303);
        exit;
    }
} catch (RequestProblem $problem) {
    http_response_code($problem->status);
    $error = $problem->getMessage();
} catch (Throwable $failure) {
    keepPrivateLog('web', $failure);
    http_response_code(503);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $error = 'Server setup is incomplete.';
    }
}

if ($user) {
    $lang = $user['locale'];
    require PEPLOG_PRIVATE . '/views/app.php';
} else {
    require PEPLOG_PRIVATE . '/views/login.php';
}

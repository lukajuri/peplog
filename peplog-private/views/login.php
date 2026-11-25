<?php require __DIR__ . '/head.php'; ?>
<body class="login-page">
<?php require __DIR__ . '/brand-filter.php'; ?>
<main class="auth-layout">
  <img class="logo auth-logo" src="assets/logo.webp" alt="Peptide Research" width="640" height="241">
  <form method="post" action="./" class="card panel form-stack auth-card" autocomplete="on">
    <h1><?= esc(translate('Sign in', $lang)) ?></h1>
    <input type="hidden" name="csrf" value="<?= esc(csrf()) ?>">
    <?php if ($error !== ''): ?>
      <p class="error" role="alert"><?= esc(translate($error, $lang)) ?></p>
    <?php endif; ?>
    <label class="field">
      <span><?= esc(translate('Username', $lang)) ?></span>
      <input name="username" autocomplete="username" required maxlength="24">
    </label>
    <label class="field">
      <span><?= esc(translate('PIN', $lang)) ?></span>
      <input name="pin" type="password" autocomplete="current-password" inputmode="numeric" required maxlength="12">
    </label>
    <button class="button button-primary" type="submit"><?= esc(translate('Sign in', $lang)) ?></button>
    <label class="field">
      <span><?= esc(translate('Language', $lang)) ?></span>
      <select id="login-language" name="lang">
        <?php foreach (LOCALES as $code => $title): ?>
          <option value="<?= esc($code) ?>" <?= $code === $lang ? 'selected' : '' ?>><?= esc($title) ?></option>
        <?php endforeach; ?>
      </select>
    </label>
    <button id="open-cookies" class="button button-quiet" type="button"><?= esc(translate('Cookies', $lang)) ?></button>
  </form>
</main>
<?php require __DIR__ . '/cookies.php'; ?>
<script src="assets/login.js" defer></script>
</body>
</html>

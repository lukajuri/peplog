<?php require __DIR__ . '/head.php'; ?>
<body class="login-page">
<?php require __DIR__ . '/brand-filter.php'; ?>
<main class="auth-layout">
  <img class="logo auth-logo" src="assets/logo.webp" alt="Peptide Research" width="640" height="241">
  <section class="card panel form-stack auth-card">
    <h1><?= esc(translate('Set up Peplog', $lang)) ?></h1>
    <?php if ($error !== ''): ?>
      <p class="error" role="alert"><?= esc(translate($error, $lang)) ?></p>
    <?php endif; ?>
    <?php if ($completed || $locked): ?>
      <p><?= esc(translate('Setup is complete. Sign in with your username and PIN.', $lang)) ?></p>
      <a class="button button-primary" href="./"><?= esc(translate('Sign in', $lang)) ?></a>
    <?php else: ?>
      <form method="post" class="form-stack">
        <input type="hidden" name="csrf" value="<?= esc(csrf()) ?>">
        <?php if (!empty($verified)): ?>
          <label class="field">
            <span><?= esc($admin . ' · ' . translate('PIN', $lang)) ?></span>
            <input name="admin_pin" type="password" autocomplete="new-password" inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" required>
          </label>
          <?php if ($member !== ''): ?>
            <label class="field">
              <span><?= esc($member . ' · ' . translate('PIN', $lang)) ?></span>
              <input name="member_pin" type="password" autocomplete="new-password" inputmode="numeric" pattern="[0-9]{6,12}" maxlength="12" required>
            </label>
          <?php endif; ?>
          <p class="help"><?= esc(translate('6–12 digits', $lang)) ?></p>
          <button class="button button-primary" type="submit"><?= esc(translate('Create accounts', $lang)) ?></button>
        <?php else: ?>
          <label class="field">
            <span><?= esc(translate('Setup key', $lang)) ?></span>
            <input name="setup_key" type="password" autocomplete="off" maxlength="256" required>
          </label>
          <button class="button button-primary" type="submit"><?= esc(translate('Continue', $lang)) ?></button>
        <?php endif; ?>
      </form>
    <?php endif; ?>
  </section>
</main>
</body>
</html>

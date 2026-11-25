<dialog id="cookie-notice" aria-labelledby="cookie-title">
  <div class="dialog-head"><h2 id="cookie-title"><?= esc(translate('Cookies', $lang)) ?></h2></div>
  <div class="dialog-body form-stack">
    <p><?= esc(translate('Peplog uses an essential session cookie to keep you signed in and protect form submissions.', $lang)) ?></p>
    <p class="muted small"><?= esc(translate('The session ends when you sign out or after two hours of inactivity.', $lang)) ?></p>
    <form method="dialog" class="dialog-foot">
      <button class="button button-primary" type="submit" value="essential"><?= esc(translate('Continue with essential cookies', $lang)) ?></button>
    </form>
  </div>
</dialog>

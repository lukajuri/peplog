<?php require __DIR__ . '/head.php'; ?>
<body>
<?php require __DIR__ . '/brand-filter.php'; ?>
<div id="journal-auth" data-token="<?= esc(csrf()) ?>" hidden></div>
<a class="skip" href="#content">Skip to main content</a>
<div class="shell" id="app">
  <aside class="sidebar">
    <img class="logo" alt="Peptide Research" src="assets/logo.webp" width="640" height="241">
    <img class="brand-icon" alt="Peptide Research" src="assets/symbol.png" width="64" height="64">
    <nav class="nav" id="side-nav" aria-label="Main navigation"></nav>
    <div class="sidebar-foot small" id="demo-label"></div>
  </aside>
  <div class="workspace">
    <header class="topbar">
      <img class="mobile-brand" alt="Peptide Research" src="assets/logo.webp" width="640" height="241">
      <span class="top-context" id="top-context"></span>
      <div class="top-actions" id="top-actions"></div>
    </header>
    <main id="content" tabindex="-1"></main>
  </div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="Main navigation"></nav>
</div>
<dialog id="dialog" aria-labelledby="dialog-title"></dialog>
<div class="toast" id="toast" role="status" hidden></div>
<p id="startup-error" role="alert" hidden><?= esc(translate('The journal could not load. Please refresh.', $lang)) ?></p>
<script src="assets/app.js" defer></script>
</body>
</html>

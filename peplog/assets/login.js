'use strict';

document.querySelector('#login-language')?.addEventListener('change', event => {
  window.location.assign('./?lang=' + encodeURIComponent(event.target.value));
});

const cookieNotice = document.querySelector('#cookie-notice');
const cookiePreference = 'peplog-essential-cookies-v1';

if (cookieNotice) {
  document.querySelector('#open-cookies')?.addEventListener('click', () => cookieNotice.showModal());
  cookieNotice.addEventListener('close', () => {
    if (cookieNotice.returnValue === 'essential') {
      try { localStorage.setItem(cookiePreference, 'acknowledged'); } catch {}
    }
  });
  let acknowledged = false;
  try { acknowledged = localStorage.getItem(cookiePreference) === 'acknowledged'; } catch {}
  if (!acknowledged) cookieNotice.showModal();
}

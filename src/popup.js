document.addEventListener('DOMContentLoaded', () => {
  const openOptions = document.getElementById('openOptions');
  if (!openOptions) return;
  openOptions.addEventListener('click', (e) => {
    e.preventDefault();
    if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      // fallback: open options page directly
      window.open(chrome.runtime.getURL('src/options.html'));
    }
  });
});

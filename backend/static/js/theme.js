/**
 * theme.js — shared dark/light mode toggle
 * Saves preference in localStorage as 'gyan-theme' = 'dark' | 'light'
 * Apply stored theme BEFORE paint to avoid flash (inline script does this)
 */
(function() {
  const btn = document.getElementById('btnThemeToggle');
  if (!btn) return;

  function getTheme() {
    return localStorage.getItem('gyan-theme') || 'dark';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('gyan-theme', theme);
    // Update button label
    const label = btn.querySelector('.theme-label');
    if (label) label.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  // Apply on load
  applyTheme(getTheme());

  // Toggle on click
  btn.addEventListener('click', () => {
    const current = getTheme();
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
})();

/* Applies the saved look before first paint, so there is no flash of the wrong theme. */
(function () {
  try {
    var root = document.documentElement;
    var theme = localStorage.getItem('forge-theme');
    var wall = localStorage.getItem('forge-wall');
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    if (wall) root.dataset.wall = wall;
  } catch (e) { /* storage unavailable: keep defaults */ }
})();

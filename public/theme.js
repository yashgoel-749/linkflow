try {
  document.documentElement.dataset.theme =
    localStorage.getItem('linkflow-theme') === 'light' ? 'light' : 'dark';
} catch {}

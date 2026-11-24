// Stan panelu na stronie. Czysta funkcja, bez chrome.

export function dockMode({ saved, sessionActive } = {}) {
  if (saved === "open" || saved === "collapsed" || saved === "closed") return saved;
  return sessionActive ? "open" : "collapsed";
}

export function nextDockMode(current, action) {
  if (action === "open") return "open";
  if (action === "close" || action === "closed") return "closed";
  if (action === "collapse" || action === "collapsed") return current === "closed" ? "closed" : "collapsed";
  if (action === "toggle") return current === "open" ? "collapsed" : "open";
  return current === "open" || current === "collapsed" || current === "closed" ? current : "collapsed";
}

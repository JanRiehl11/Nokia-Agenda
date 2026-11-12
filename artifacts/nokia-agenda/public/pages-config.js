(() => {
  const hostname = window.location.hostname.toLowerCase();
  const isLocalPreview =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".replit.dev") ||
    hostname.endsWith(".replit.app");

  window.NOKIA_AGENDA_API_BASE = isLocalPreview
    ? window.location.origin
    : "https://nokia-agenda--janriehl11.replit.app";
})();

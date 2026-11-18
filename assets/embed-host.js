// Load this on the page that embeds the dashboard. It resizes each dashboard iframe to fit its
// content, using the height the dashboard reports (see embed.js). Not loaded by the dashboard itself.
(function () {
  const origin = new URL(document.currentScript.src).origin;

  window.addEventListener("message", (event) => {
    if (event.origin !== origin || !event.data || event.data.type !== "bluewave:height") return;
    const height = Number(event.data.height);
    if (!Number.isFinite(height) || height <= 0 || height > 20000) return;
    for (const frame of document.querySelectorAll("iframe")) {
      if (frame.contentWindow === event.source) frame.style.height = height + "px";
    }
  });
})();

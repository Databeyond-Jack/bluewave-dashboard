// ?embed=1 hides the dashboard's own title bar and footer, for showing it inside an iframe on another site.
if (new URLSearchParams(location.search).has("embed")) {
  document.documentElement.classList.add("embed");
}

// Inside an iframe, report the page height to the parent whenever it changes, so the
// host page (via /assets/embed-host.js) can size the iframe to fit with no inner scrollbar.
if (window.parent !== window) {
  const start = () => {
    let last = 0;
    const send = () => {
      const height = Math.ceil(document.body.getBoundingClientRect().height);
      if (height && height !== last) {
        last = height;
        window.parent.postMessage({ type: "bluewave:height", height }, "*");
      }
    };
    new ResizeObserver(send).observe(document.body);
    send();
  };
  if (document.body) start();
  else document.addEventListener("DOMContentLoaded", start);
}

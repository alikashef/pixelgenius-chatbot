/*
 * PixelGenius chat widget loader.
 *
 *   <script src="https://YOUR-APP/embed.js" data-bot="BOT_TOKEN" async></script>
 *
 * The chat itself (robot, voice, OTP and order submission) runs in an iframe of
 * /chat?embed=1, so the widget always matches the app. The freelancer's widget
 * settings (accent color, button position) are read from /api/bot/{token}.
 *
 * Optional attributes: data-position (bottom-left | bottom-right), data-mode
 * (floating | inline), data-container (CSS selector for inline mode),
 * data-height (inline height), data-auto-open (true), data-app-url.
 */
(function () {
  "use strict";

  if (window.PixelGeniusWidget) return;

  var script = document.currentScript;
  if (!script) return;

  // Keep in sync with WIDGET_COLORS in frontend/lib/widget.ts.
  var ACCENTS = {
    saffron: { bg: "#f28c28", fg: "#1c1a17" },
    ink: { bg: "#36312b", fg: "#fbfaf7" },
    emerald: { bg: "#0f9d6e", fg: "#ffffff" },
    ocean: { bg: "#2f6fde", fg: "#ffffff" },
    rose: { bg: "#e2456b", fg: "#ffffff" },
    plum: { bg: "#7c4dbd", fg: "#ffffff" },
  };

  function attr(name) {
    return script.getAttribute("data-" + name) || "";
  }

  var appUrl = (attr("app-url") || attr("api-url") || new URL(script.src).origin).replace(/\/+$/, "");
  var appOrigin = new URL(appUrl).origin;
  var bot = attr("bot");
  var inline = attr("mode") === "inline" || attr("mode") === "box";
  var config = {
    position: attr("position"),
    height: attr("height") || "640px",
    autoOpen: attr("auto-open") === "true",
    accent: ACCENTS.saffron,
    title: "چت با دستیار پروژه",
  };

  var chatUrl = appUrl + "/chat?embed=1" + (bot ? "&bot=" + encodeURIComponent(bot) : "");
  var host, shadow, panel, launcher, frame;
  var open = false;

  function start(profile) {
    var widget = (profile && profile.widget) || {};
    if (ACCENTS[widget.accent]) config.accent = ACCENTS[widget.accent];
    if (!config.position) config.position = widget.position === "bottom-right" ? "bottom-right" : "bottom-left";
    if (profile) config.title = "چت با " + (widget.brand_name || profile.name || "دستیار پروژه");
    if (inline) mountInline();
    else mountFloating();
  }

  function createFrame() {
    frame = document.createElement("iframe");
    frame.src = chatUrl;
    frame.title = config.title;
    frame.setAttribute("allow", "autoplay; clipboard-write");
    frame.setAttribute("loading", "lazy");
    frame.style.cssText = "border:0;width:100%;height:100%;display:block;background:transparent;color-scheme:normal";
    return frame;
  }

  function mountInline() {
    var target = (attr("container") && document.querySelector(attr("container"))) || script.parentElement || document.body;
    var box = document.createElement("div");
    box.style.cssText = "width:100%;height:" + config.height + ";border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,.08)";
    box.appendChild(createFrame());
    target.appendChild(box);
  }

  function mountFloating() {
    host = document.createElement("div");
    shadow = host.attachShadow({ mode: "open" });
    var side = config.position === "bottom-right" ? "right" : "left";
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      ".launcher{position:fixed;bottom:24px;" + side + ":24px;z-index:2147483646;width:60px;height:60px;border:0;border-radius:50%;cursor:pointer;" +
      "display:grid;place-items:center;background:" + config.accent.bg + ";color:" + config.accent.fg + ";" +
      "box-shadow:0 10px 30px -8px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.12);transition:transform .18s ease}" +
      ".launcher:hover{transform:translateY(-2px)}" +
      ".launcher:focus-visible{outline:3px solid " + config.accent.bg + ";outline-offset:3px}" +
      ".launcher svg{width:28px;height:28px}" +
      ".panel{position:fixed;bottom:96px;" + side + ":24px;z-index:2147483647;width:400px;height:min(680px,calc(100vh - 120px));" +
      "border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 24px 60px -12px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.06);" +
      "opacity:0;transform:translateY(12px) scale(.98);pointer-events:none;visibility:hidden;transition:opacity .2s ease,transform .2s ease,visibility .2s}" +
      ".panel.open{opacity:1;transform:none;pointer-events:auto;visibility:visible}" +
      "@media (max-width:520px){.panel{inset:0;width:auto;height:auto;border-radius:0}.panel.open~.launcher{display:none}}" +
      "@media (prefers-reduced-motion:reduce){.panel,.launcher{transition:none}}" +
      "</style>" +
      "<div class='panel' role='dialog' aria-label='" + escapeAttr(config.title) + "'></div>" +
      "<button class='launcher' type='button' aria-expanded='false' aria-label='" + escapeAttr(config.title) + "'></button>";
    panel = shadow.querySelector(".panel");
    launcher = shadow.querySelector(".launcher");
    launcher.addEventListener("click", function () {
      setOpen(!open);
    });
    renderIcon();
    document.body.appendChild(host);
    if (config.autoOpen) setOpen(true);
  }

  function renderIcon() {
    launcher.innerHTML = open
      ? "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' aria-hidden='true'><path d='M6 6l12 12M18 6L6 18'/></svg>"
      : "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linejoin='round' aria-hidden='true'><path d='M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-7.2L7.4 20v-3.5H5A1.5 1.5 0 0 1 3.5 15V6A1.5 1.5 0 0 1 5 4.5Z'/><path d='M8.5 9.5h7M8.5 12.5h4.5' stroke-linecap='round'/></svg>";
  }

  function setOpen(next) {
    if (inline || !panel) return;
    open = next;
    // The chat loads on first open and stays alive afterwards so the conversation is kept.
    if (open && !frame) panel.appendChild(createFrame());
    panel.classList.toggle("open", open);
    launcher.setAttribute("aria-expanded", String(open));
    launcher.setAttribute("aria-label", open ? "بستن چت" : config.title);
    renderIcon();
    if (open && frame) frame.focus();
    else if (!open) launcher.focus();
  }

  function escapeAttr(value) {
    return String(value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  window.addEventListener("message", function (event) {
    if (event.origin !== appOrigin || !event.data || event.data.type !== "pixelgenius:close") return;
    setOpen(false);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) setOpen(false);
  });

  var api = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!open); },
  };
  window.PixelGeniusWidget = api;
  // Names used by earlier versions of the widget.
  window.PixelGeniusChatbot = api;
  window.FreelioWidget = api;

  function boot() {
    if (!bot) return start(null);
    fetch(appUrl + "/api/bot/" + encodeURIComponent(bot))
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(start);
  }

  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
})();

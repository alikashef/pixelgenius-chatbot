/*
 * PixelGenius review bridge. Loaded into a project preview only in review mode
 * (?pg_review=1 on our preview hosts, or inline in HTML versions). It lets the
 * workspace pick elements and draws numbered pins; it talks to the parent frame only.
 */
(function () {
  if (window.__pgReview) return;
  window.__pgReview = true;

  var on = false;
  var pins = [];
  var layer, hl;

  function selectorOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el.tagName !== "HTML") {
      var s = el.tagName.toLowerCase();
      if (el.id) {
        parts.unshift(s + "#" + CSS.escape(el.id));
        break;
      }
      var p = el.parentElement;
      if (p) {
        var same = Array.prototype.filter.call(p.children, function (x) { return x.tagName === el.tagName; });
        if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      parts.unshift(s);
      el = p;
    }
    return parts.join(" > ");
  }

  // The element's own tag with attributes and a short text, e.g. <button class="cta">سفارش طراحی</button>.
  function htmlOf(el) {
    var clone = el.cloneNode(false);
    var text = (el.innerText || el.getAttribute("alt") || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
    if (text.length > 120) text = text.slice(0, 120) + "…";
    var open = clone.outerHTML.replace(/<\/[^>]+>$/, "");
    if (open.length > 400) open = open.slice(0, 400) + "…>";
    var tag = el.tagName.toLowerCase();
    return /^(img|input|br|hr|meta|link|source)$/.test(tag) ? open : open + text + "</" + tag + ">";
  }

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement("div");
    layer.setAttribute("data-pg-review", "");
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none";
    hl = document.createElement("div");
    hl.style.cssText = "position:absolute;display:none;border:2px solid #7c3aed;background:rgba(124,58,237,.08);border-radius:4px;transition:all .08s";
    layer.appendChild(hl);
    document.body.appendChild(layer);
    return layer;
  }

  function place(node, r) {
    node.style.left = r.left + scrollX + "px";
    node.style.top = r.top + scrollY + "px";
    node.style.width = r.width + "px";
    node.style.height = r.height + "px";
  }

  function draw() {
    var l = ensureLayer();
    Array.prototype.forEach.call(l.querySelectorAll("[data-pin]"), function (n) { n.remove(); });
    pins.forEach(function (p) {
      if (p.page && p.page !== location.pathname) return;
      var el;
      try { el = document.querySelector(p.selector); } catch (e) { return; }
      if (!el) return;
      var r = el.getBoundingClientRect();
      var color = p.active ? "#f59e0b" : "#7c3aed";
      var b = document.createElement("div");
      b.setAttribute("data-pin", "");
      b.textContent = p.n;
      b.style.cssText = "position:absolute;width:22px;height:22px;border-radius:11px;color:#fff;font:700 11px/22px system-ui;text-align:center;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.25);background:" + color;
      // Pin the start corner of the element: top-right on right-to-left pages.
      var rtl = getComputedStyle(el).direction === "rtl";
      b.style.left = (rtl ? r.right : r.left) + scrollX - 11 + "px";
      b.style.top = r.top + scrollY - 11 + "px";
      l.appendChild(b);
      if (p.active) {
        var o = document.createElement("div");
        o.setAttribute("data-pin", "");
        o.style.cssText = "position:absolute;border:2px solid " + color + ";border-radius:4px";
        place(o, r);
        l.appendChild(o);
      }
    });
  }

  document.addEventListener("mousemove", function (e) {
    if (!on) return;
    var el = e.target;
    if (!(el instanceof Element) || (layer && layer.contains(el))) return;
    ensureLayer();
    hl.style.display = "block";
    place(hl, el.getBoundingClientRect());
  }, true);

  document.addEventListener("click", function (e) {
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!(el instanceof Element)) return;
    parent.postMessage({
      type: "workspace-element",
      selector: selectorOf(el),
      html: htmlOf(el),
      page: location.pathname || "/",
      x: (e.clientX / innerWidth) * 100,
      y: (e.clientY / innerHeight) * 100,
    }, "*");
  }, true);

  // Keep review mode while the owner browses between pages of the preview.
  document.addEventListener("click", function (e) {
    var a = e.target instanceof Element && e.target.closest("a[href]");
    if (!a || on) return;
    try {
      var u = new URL(a.href, location.href);
      if (u.origin === location.origin && !u.searchParams.has("pg_review")) {
        u.searchParams.set("pg_review", "1");
        a.href = u.toString();
      }
    } catch (err) { /* ignore */ }
  }, true);

  addEventListener("message", function (e) {
    var d = e.data || {};
    if (d.type !== "workspace-annotate") return;
    on = !!d.on;
    pins = d.pins || [];
    document.documentElement.style.cursor = on ? "crosshair" : "";
    ensureLayer();
    if (!on) hl.style.display = "none";
    draw();
  });
  addEventListener("scroll", draw, true);
  addEventListener("resize", draw);

  function ready() {
    parent.postMessage({ type: "workspace-ready", page: location.pathname || "/" }, "*");
  }
  if (document.body) ready();
  else document.addEventListener("DOMContentLoaded", ready);
})();

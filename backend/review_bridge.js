/*
 * PixelGenius review bridge. The backend inlines it into a project preview only in review mode
 * (?pg_review=1 on our preview hosts). It lets the workspace pick elements and draws numbered pins;
 * it talks to the parent frame only.
 */
(function () {
  if (window.__pgReview) return;
  window.__pgReview = true;

  var on = false;
  var composing = false;
  var picked = null;
  var pins = [];
  var layer, hl, tag;
  var BLUE = "#3b82f6";

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

  // A short name for the hover label, e.g. button.cta or section#pricing.
  function labelOf(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    var cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/).filter(Boolean)[0];
    return cls ? s + "." + cls : s;
  }

  function outline(el) {
    ensureLayer();
    var r = el.getBoundingClientRect();
    hl.style.display = "block";
    hl.style.left = r.left + scrollX - 3 + "px";
    hl.style.top = r.top + scrollY - 3 + "px";
    hl.style.width = r.width + 6 + "px";
    hl.style.height = r.height + 6 + "px";
    tag.textContent = labelOf(el);
    tag.style.display = composing ? "none" : "block";
    // Label on the element's start corner: top-right on right-to-left pages.
    tag.style.left = (getComputedStyle(el).direction === "rtl" ? r.right + 3 - tag.offsetWidth : r.left - 3) + scrollX + "px";
    tag.style.top = Math.max(0, r.top + scrollY - 24) + "px";
  }

  function hide() {
    if (!hl) return;
    hl.style.display = "none";
    tag.style.display = "none";
  }

  // Where the picked element is in the preview's viewport, so the workspace can anchor its task box on it.
  function report() {
    if (!picked) return;
    var r = picked.getBoundingClientRect();
    parent.postMessage({ type: "workspace-rect", left: r.left, top: r.top, width: r.width, height: r.height, vw: innerWidth, vh: innerHeight, rtl: getComputedStyle(picked).direction === "rtl" }, "*");
  }

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement("div");
    layer.setAttribute("data-pg-review", "");
    layer.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none";
    hl = document.createElement("div");
    hl.style.cssText = "position:absolute;display:none;box-sizing:border-box;border:2px solid " + BLUE + ";border-radius:10px;background:rgba(59,130,246,.06);transition:left .08s,top .08s,width .08s,height .08s";
    tag = document.createElement("div");
    tag.style.cssText = "position:absolute;display:none;padding:2px 7px;border-radius:6px;background:" + BLUE + ";color:#fff;font:600 11px/16px ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap;direction:ltr";
    layer.appendChild(hl);
    layer.appendChild(tag);
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
    var seen = {};
    pins.forEach(function (p) {
      if (p.page && p.page !== location.pathname) return;
      // Several tasks on one element: line their pins up instead of stacking them.
      var nth = seen[p.selector] = (seen[p.selector] || 0) + 1;
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
      b.style.left = (rtl ? r.right - (nth - 1) * 26 : r.left + (nth - 1) * 26) + scrollX - 11 + "px";
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
    if (!on || composing) return;
    var el = e.target;
    if (!(el instanceof Element) || (layer && layer.contains(el)) || el === document.body || el === document.documentElement) return;
    outline(el);
  }, true);

  document.addEventListener("mouseleave", function () {
    if (on && !composing) hide();
  });

  document.addEventListener("click", function (e) {
    if (!on) return;
    e.preventDefault();
    e.stopPropagation();
    var el = e.target;
    if (!(el instanceof Element) || composing) return;
    picked = el;
    composing = true;
    outline(el);
    var r = el.getBoundingClientRect();
    parent.postMessage({
      type: "workspace-element",
      selector: selectorOf(el),
      html: htmlOf(el),
      label: labelOf(el),
      page: location.pathname || "/",
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      vw: innerWidth,
      vh: innerHeight,
      rtl: getComputedStyle(el).direction === "rtl",
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
    // The workspace closes the task box (saved or cancelled): let go of the picked element.
    if (!d.composing) {
      composing = false;
      picked = null;
    }
    document.documentElement.style.cursor = on && !composing ? "crosshair" : "";
    ensureLayer();
    if (!on || !composing) hide();
    if (composing && picked) outline(picked);
    draw();
  });
  function follow() {
    draw();
    if (composing && picked) {
      outline(picked);
      report();
    }
  }
  addEventListener("scroll", follow, true);
  addEventListener("resize", follow);

  function ready() {
    parent.postMessage({ type: "workspace-ready", page: location.pathname || "/" }, "*");
  }
  if (document.body) ready();
  else document.addEventListener("DOMContentLoaded", ready);
})();

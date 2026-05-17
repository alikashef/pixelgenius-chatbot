(function () {
  "use strict";

  if (window.PixelGeniusChatbot) return;

  var currentScript = document.currentScript;
  var scriptOrigin = currentScript ? new URL(currentScript.src).origin : window.location.origin;
  var config = {
    apiUrl: attr("api-url") || scriptOrigin,
    loginUrl: attr("login-url") || scriptOrigin + "/login",
    title: attr("title") || "مشاور پروژه",
    subtitle: attr("subtitle") || "آنلاین",
    brand: attr("brand") || "نابغه پیکسل",
    mode: normalizeMode(attr("mode")),
    container: attr("container"),
    primaryColor: attr("primary-color") || attr("primary") || attr("accent") || "#059669",
    fontFamily: attr("font-family") || "Vazirmatn",
    fontUrl: attr("font-url") || "https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css",
    position: attr("position") || "bottom-left",
    height: attr("height") || "560px",
    autoOpen: attr("auto-open") === "true",
  };

  var WELCOME = "سلام! خوش اومدید.\nمن مشاور هوشمند تیم " + config.brand + " هستم. بهم بگید چه نوع پروژه‌ای در ذهن دارید؟";
  var PHONE_ASK = "پروپوزال پروژه‌تون آماده‌ست.\nبرای ثبت درخواست، شماره موبایلتون رو بنویسید تا کد تایید ارسال کنیم:";
  var STORAGE_KEY = "pixelgenius_embed_chat_v1";

  if (!document.body && currentScript) {
    document.addEventListener(
      "DOMContentLoaded",
      function () {
        if (window.PixelGeniusChatbot) return;
        var retryScript = document.createElement("script");
        retryScript.src = currentScript.src;
        Array.prototype.forEach.call(currentScript.attributes, function (attribute) {
          if (attribute.name !== "src") retryScript.setAttribute(attribute.name, attribute.value);
        });
        document.head.appendChild(retryScript);
      },
      { once: true }
    );
    return;
  }

  var state = readState();
  loadFont();
  var root = document.createElement("div");
  var shadow = root.attachShadow({ mode: "open" });
  var mountTarget = getMountTarget();
  mountTarget.appendChild(root);

  shadow.innerHTML = [
    "<style>",
    ":host{all:initial;--pg-primary:" + escapeCss(config.primaryColor) + ";--pg-height:" + escapeCss(config.height) + ";--pg-font:" + cssFontFamily(config.fontFamily) + ",Tahoma,Arial,sans-serif;font-family:var(--pg-font);direction:rtl;color:#0f172a}",
    "*,*::before,*::after{box-sizing:border-box;font-family:var(--pg-font)}",
    ".pg-wrap{position:fixed;z-index:2147483647;inset:auto auto 24px 24px;font-family:inherit;direction:rtl}",
    ".pg-wrap[data-position='bottom-right']{inset:auto 24px 24px auto}",
    ".pg-button{width:62px;height:62px;border:0;border-radius:50%;background:var(--pg-primary);color:#fff;box-shadow:0 18px 45px rgba(15,23,42,.24);cursor:pointer;display:grid;place-items:center;transition:transform .18s ease,box-shadow .18s ease}",
    ".pg-button:hover{transform:translateY(-2px);box-shadow:0 22px 55px rgba(15,23,42,.3)}",
    ".pg-button svg{width:30px;height:30px}",
    ".pg-panel{position:absolute;bottom:78px;left:0;width:min(380px,calc(100vw - 32px));height:min(620px,calc(100vh - 112px));background:#f8fcfa;border:1px solid #dbe5e1;border-radius:18px;box-shadow:0 24px 70px rgba(15,23,42,.28);overflow:hidden;display:none;grid-template-rows:auto 1fr auto}",
    ".pg-wrap[data-position='bottom-right'] .pg-panel{left:auto;right:0}",
    ".pg-wrap[data-open='true'] .pg-panel{display:grid}",
    ".pg-wrap[data-mode='inline']{position:relative;z-index:auto;inset:auto;width:100%;height:var(--pg-height)}",
    ".pg-wrap[data-mode='inline'] .pg-panel{position:relative;inset:auto;width:100%;height:100%;display:grid;border-radius:12px;box-shadow:none}",
    ".pg-wrap[data-mode='inline'] .pg-button,.pg-wrap[data-mode='inline'] .pg-close{display:none}",
    ".pg-head{background:rgba(255,255,255,.94);border-bottom:1px solid #dbe5e1;padding:14px 16px;display:flex;align-items:center;gap:10px}",
    ".pg-dot{width:10px;height:10px;border-radius:50%;background:var(--pg-primary);box-shadow:0 0 0 5px color-mix(in srgb,var(--pg-primary) 14%,transparent)}",
    ".pg-title{font-size:15px;font-weight:700;color:#0f172a;line-height:1.4;margin:0}",
    ".pg-sub{font-size:12px;color:#64748b;margin:0}",
    ".pg-close,.pg-reset{border:0;background:transparent;color:#64748b;cursor:pointer;font:inherit;font-family:var(--pg-font);padding:6px;border-radius:8px}",
    ".pg-close:hover,.pg-reset:hover{background:#eef5f1;color:#0f172a}",
    ".pg-spacer{flex:1}",
    ".pg-body{overflow:auto;padding:16px 14px;background:linear-gradient(180deg,#f8fcfa 0%,#f1f7f4 100%)}",
    ".pg-msg-row{display:flex;margin:0 0 12px}",
    ".pg-msg-row.user{justify-content:flex-start}",
    ".pg-msg-row.assistant{justify-content:flex-end}",
    ".pg-msg{max-width:82%;white-space:pre-wrap;border-radius:16px;padding:11px 13px;font-size:13px;line-height:1.8;word-break:break-word}",
    ".pg-msg.user{background:#fff;border:1px solid #dbe5e1;color:#0f172a;box-shadow:0 1px 2px rgba(15,23,42,.04)}",
    ".pg-msg.assistant{background:var(--pg-primary);color:#fff;font-weight:500}",
    ".pg-typing{display:inline-flex;gap:4px;align-items:center}",
    ".pg-typing span{width:6px;height:6px;border-radius:50%;background:#fff;opacity:.8;animation:pg-bounce .9s infinite ease-in-out}",
    ".pg-typing span:nth-child(2){animation-delay:.12s}.pg-typing span:nth-child(3){animation-delay:.24s}",
    "@keyframes pg-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}",
    ".pg-error{margin:0 0 12px;text-align:center;color:#dc2626;font-size:12px;line-height:1.7}",
    ".pg-form{border-top:1px solid #dbe5e1;background:rgba(255,255,255,.94);padding:12px;display:flex;gap:8px}",
    ".pg-input{min-width:0;flex:1;border:1px solid #dbe5e1;background:#fff;border-radius:12px;padding:11px 12px;font:400 13px/1.4 var(--pg-font);color:#0f172a;outline:none}",
    ".pg-input:focus{border-color:var(--pg-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--pg-primary) 16%,transparent)}",
    ".pg-send{border:0;border-radius:12px;background:var(--pg-primary);color:#fff;font:700 13px/1 var(--pg-font);padding:0 15px;cursor:pointer;min-width:62px}",
    ".pg-send:disabled{opacity:.55;cursor:not-allowed}",
    "@media (max-width:520px){.pg-wrap{inset:auto 16px 16px 16px}.pg-wrap[data-position='bottom-right']{inset:auto 16px 16px 16px}.pg-panel{position:fixed;left:16px;right:16px;bottom:88px;width:auto;height:min(620px,calc(100vh - 112px))}.pg-wrap[data-position='bottom-right'] .pg-panel{left:16px;right:16px}.pg-wrap[data-mode='inline']{inset:auto;height:var(--pg-height)}.pg-wrap[data-mode='inline'] .pg-panel{position:relative;left:auto;right:auto;bottom:auto;width:100%;height:100%}}",
    "</style>",
    "<div class='pg-wrap' data-mode='" + escapeHtml(config.mode) + "' data-position='" + escapeHtml(config.position) + "' data-open='" + String(config.autoOpen || config.mode === "inline") + "'>",
    "  <section class='pg-panel' aria-label='چت مشاوره پروژه'>",
    "    <header class='pg-head'>",
    "      <span class='pg-dot' aria-hidden='true'></span>",
    "      <div><p class='pg-title'></p><p class='pg-sub'></p></div>",
    "      <span class='pg-spacer'></span>",
    "      <button class='pg-reset' type='button' title='چت جدید'>↻</button>",
    "      <button class='pg-close' type='button' title='بستن'>×</button>",
    "    </header>",
    "    <main class='pg-body'></main>",
    "    <form class='pg-form'>",
    "      <input class='pg-input' autocomplete='off' />",
    "      <button class='pg-send' type='submit'>ارسال</button>",
    "    </form>",
    "  </section>",
    "  <button class='pg-button' type='button' aria-label='باز کردن چت'>",
    "    <svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z'/></svg>",
    "  </button>",
    "</div>",
  ].join("");

  var wrap = shadow.querySelector(".pg-wrap");
  var panel = shadow.querySelector(".pg-panel");
  var button = shadow.querySelector(".pg-button");
  var closeButton = shadow.querySelector(".pg-close");
  var resetButton = shadow.querySelector(".pg-reset");
  var title = shadow.querySelector(".pg-title");
  var subtitle = shadow.querySelector(".pg-sub");
  var body = shadow.querySelector(".pg-body");
  var form = shadow.querySelector(".pg-form");
  var input = shadow.querySelector(".pg-input");
  var sendButton = shadow.querySelector(".pg-send");

  title.textContent = config.title;
  subtitle.textContent = config.subtitle;

  button.addEventListener("click", function () {
    setOpen(wrap.getAttribute("data-open") !== "true");
  });
  closeButton.addEventListener("click", function () {
    setOpen(false);
  });
  resetButton.addEventListener("click", function () {
    state = defaultState();
    saveState();
    render();
    input.focus();
  });
  form.addEventListener("submit", onSubmit);

  render();
  if (config.autoOpen || config.mode === "inline") input.focus();

  window.PixelGeniusChatbot = {
    open: function () {
      setOpen(true);
    },
    close: function () {
      setOpen(false);
    },
    reset: function () {
      state = defaultState();
      saveState();
      render();
    },
  };

  function attr(name) {
    return currentScript ? currentScript.getAttribute("data-" + name) : "";
  }

  function normalizeMode(mode) {
    return mode === "box" || mode === "inline" ? "inline" : "floating";
  }

  function loadFont() {
    if (!config.fontUrl || document.querySelector("link[data-pixelgenius-font='true']")) return;
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = config.fontUrl;
    link.setAttribute("data-pixelgenius-font", "true");
    document.head.appendChild(link);
  }

  function getMountTarget() {
    if (config.mode !== "inline") return document.body;
    if (config.container) {
      var container = document.querySelector(config.container);
      if (container) return container;
    }
    if (currentScript && currentScript.parentElement && currentScript.parentElement !== document.head) {
      return currentScript.parentElement;
    }
    return document.body;
  }

  function defaultState() {
    return {
      messages: [{ role: "assistant", content: WELCOME }],
      phoneStep: false,
      loading: false,
      error: "",
    };
  }

  function readState() {
    try {
      var parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "");
      if (parsed && Array.isArray(parsed.messages) && typeof parsed.phoneStep === "boolean") {
        return {
          messages: parsed.messages.filter(isMessage),
          phoneStep: parsed.phoneStep,
          loading: false,
          error: "",
        };
      }
    } catch (error) {
      return defaultState();
    }
    return defaultState();
  }

  function isMessage(message) {
    return message && (message.role === "user" || message.role === "assistant") && typeof message.content === "string";
  }

  function saveState() {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages: state.messages, phoneStep: state.phoneStep })
      );
    } catch (error) {
      // Storage can be unavailable in restricted embeds; the chat still works for the current page.
    }
  }

  function setOpen(open) {
    if (config.mode === "inline") open = true;
    wrap.setAttribute("data-open", String(open));
    button.setAttribute("aria-expanded", String(open));
    if (open) {
      setTimeout(function () {
        input.focus();
      }, 0);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text || state.loading) return;

    state.messages.push({ role: "user", content: text });
    input.value = "";
    state.error = "";
    render();

    if (state.phoneStep) {
      await sendOtp(text);
      return;
    }

    state.loading = true;
    render();

    try {
      var reply = await sendChat(state.messages.slice(1).slice(-10));
      var lead = parseLead(reply);
      if (lead) {
        var clientReply = lead.client_message || "پیشنهاد اولیه پروژه آماده شد.";
        state.handoff = buildHandoff(lead);
        state.messages.push({ role: "assistant", content: clientReply + "\n\n" + PHONE_ASK });
        state.phoneStep = true;
      } else {
        state.messages.push({ role: "assistant", content: reply });
      }
      saveState();
    } catch (error) {
      state.error = error.message || "خطا در ارتباط با سرور";
    } finally {
      state.loading = false;
      render();
    }
  }

  async function sendChat(messages) {
    var response = await fetch(joinUrl(config.apiUrl, "/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    });
    if (!response.ok) throw new Error(await readError(response, "خطا در ارتباط با سرور"));
    var data = await response.json();
    return data.content || "";
  }

  async function sendOtp(phone) {
    state.loading = true;
    render();

    try {
      var response = await fetch(joinUrl(config.apiUrl, "/api/customer/otp/send"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, "خطا در ارسال کد"));
      }
      state.messages.push({
        role: "assistant",
        content: "کد تایید به " + phone + " ارسال شد. الان به صفحه ورود منتقل می‌شید تا درخواست ثبت بشه.",
      });
      state.error = "";
      saveState();
      render();
      setTimeout(function () {
      var url = new URL(config.loginUrl, window.location.href);
      url.searchParams.set("phone", phone);
      url.searchParams.set("redirect", "/panel");
      if (state.handoff) url.searchParams.set("handoff", encodeHandoff(state.handoff));
      window.location.href = url.toString();
      }, 1200);
    } catch (error) {
      state.error = error.message || "خطا در ارسال کد";
      state.messages.push({ role: "assistant", content: "مشکلی در ارسال کد پیش اومد. شماره رو دوباره وارد کنید:" });
    } finally {
      state.loading = false;
      render();
    }
  }

  function parseLead(reply) {
    var trimmed = (reply || "").trim();
    if (trimmed.charAt(0) !== "{") return null;
    try {
      var parsed = JSON.parse(trimmed);
      if (
        typeof parsed.project_type === "string" &&
        typeof parsed.client_message === "string" &&
        Array.isArray(parsed.missing_questions)
      ) {
        return parsed;
      }
    } catch (error) {
      return null;
    }
    return null;
  }

  function buildHandoff(lead) {
    var proposal = leadToProposal(lead);
    return {
      version: 1,
      proposal: proposal,
      chatHistory: state.messages.filter(isMessage).slice(-20),
    };
  }

  function leadToProposal(lead) {
    return {
      type: "proposal",
      projectName: lead.project_type || "درخواست پروژه",
      summary: [lead.client_message, lead.admin_summary ? "خلاصه ادمین: " + lead.admin_summary : ""].filter(Boolean).join("\n\n"),
      features: [
        lead.project_goal ? "هدف: " + lead.project_goal : "",
        lead.recommended_solution ? "راهکار پیشنهادی: " + lead.recommended_solution : "",
        lead.budget_fit ? "تناسب بودجه: " + lead.budget_fit : "",
        lead.client_risk_level ? "سطح ریسک: " + lead.client_risk_level : "",
        typeof lead.lead_score === "number" ? "امتیاز لید: " + lead.lead_score : "",
      ]
        .concat((lead.missing_questions || []).map(function (question) {
          return "ابهام: " + question;
        }))
        .filter(Boolean),
      tech: lead.recommended_stack || "",
      days: parseDays(lead.estimated_timeline || ""),
      price: parsePriceEstimate(lead.estimated_price_range || ""),
      priceLabel: lead.estimated_price_range || "",
    };
  }

  function parseDays(timeline) {
    var numbers = String(timeline).match(/\d+/g) || [];
    if (!numbers.length) return 14;
    var max = Math.max.apply(null, numbers.map(Number));
    if (timeline.indexOf("ماه") >= 0) return max * 30;
    if (timeline.indexOf("هفته") >= 0) return max * 7;
    return max;
  }

  function parsePriceEstimate(priceRange) {
    var normalized = String(priceRange).replace(/[۰-۹]/g, function (digit) {
      return "۰۱۲۳۴۵۶۷۸۹".indexOf(digit).toString();
    });
    var numbers = normalized.match(/\d+/g) || [];
    if (!numbers.length) return 0;
    return Math.max.apply(null, numbers.map(Number)) * 1000000;
  }

  function encodeHandoff(payload) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function render() {
    body.innerHTML = "";
    state.messages.forEach(function (message) {
      var row = document.createElement("div");
      var bubble = document.createElement("div");
      row.className = "pg-msg-row " + message.role;
      bubble.className = "pg-msg " + message.role;
      bubble.textContent = message.content;
      row.appendChild(bubble);
      body.appendChild(row);
    });

    if (state.loading) {
      var row = document.createElement("div");
      var bubble = document.createElement("div");
      row.className = "pg-msg-row assistant";
      bubble.className = "pg-msg assistant";
      bubble.innerHTML = "<span class='pg-typing'><span></span><span></span><span></span></span>";
      row.appendChild(bubble);
      body.appendChild(row);
    }

    if (state.error) {
      var error = document.createElement("p");
      error.className = "pg-error";
      error.textContent = state.error;
      body.appendChild(error);
    }

    input.placeholder = state.phoneStep ? "09xxxxxxxxx" : "پیام خود را بنویسید...";
    input.type = state.phoneStep ? "tel" : "text";
    input.dir = state.phoneStep ? "ltr" : "rtl";
    input.disabled = state.loading;
    sendButton.disabled = state.loading;
    panel.setAttribute("aria-busy", String(state.loading));
    body.scrollTop = body.scrollHeight;
  }

  function joinUrl(base, path) {
    return String(base).replace(/\/+$/, "") + path;
  }

  async function readError(response, fallback) {
    try {
      var body = await response.json();
      return body.detail || body.message || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[character];
    });
  }

  function escapeCss(value) {
    return String(value).replace(/[;"\\]/g, "");
  }

  function cssFontFamily(value) {
    return "'" + String(value).replace(/['"\\]/g, "") + "'";
  }
})();

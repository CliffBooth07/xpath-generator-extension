// content.js
// idempotent injection and graceful cleanup

if (!window.__xpath_click_copier_injected) {
  window.__xpath_click_copier_injected = true;

  // state
  window.__xc_enabled = true; // starts enabled on injection; popup can toggle via messages

  // create highlight box
  const highlightBox = document.createElement("div");
  highlightBox.style.position = "absolute";
  highlightBox.style.backgroundColor = "rgba(255,0,0,0.08)";
  highlightBox.style.border = "2px solid rgba(255,0,0,0.9)";
  highlightBox.style.zIndex = "2147483647";
  highlightBox.style.pointerEvents = "none";
  highlightBox.style.transition = "top 0.05s, left 0.05s, width 0.05s, height 0.05s";
  highlightBox.id = "__xc_highlight_box";
  document.documentElement.appendChild(highlightBox);

  // create toast
  const toast = document.createElement("div");
  toast.id = "__xc_toast";
  toast.style.position = "fixed";
  toast.style.bottom = "12px";
  toast.style.left = "12px";
  toast.style.background = "rgba(0,0,0,0.85)";
  toast.style.color = "#fff";
  toast.style.padding = "8px 10px";
  toast.style.borderRadius = "6px";
  toast.style.fontSize = "12px";
  toast.style.zIndex = "2147483647";
  toast.style.display = "none";
  toast.style.maxWidth = "60vw";
  toast.style.wordBreak = "break-word";
  document.documentElement.appendChild(toast);

  function showToast(text, ms = 1800) {
    toast.textContent = text;
    toast.style.display = "block";
    clearTimeout(toast._h);
    toast._h = setTimeout(() => (toast.style.display = "none"), ms);
  }

  // helper: escape quotes for XPath text()
  function escapeForXPathText(s) {
    if (s.indexOf("'") === -1) return `'${s}'`;
    if (s.indexOf('"') === -1) return `"${s}"`;
    // mix -> concat form
    return "concat('" + s.replace(/'/g, "',\"'\",'") + "')";
  }

  // positional fallback
  function getPositionalXPath(element) {
    if (!element) return '';
    if (element === document.body) return "/html/body";
    if (!element.parentNode) return "";
    let ix = 0;
    const siblings = element.parentNode.childNodes;
    for (let i = 0; i < siblings.length; i++) {
      const sib = siblings[i];
      if (sib.nodeType === 1 && sib.tagName === element.tagName) {
        ix++;
        if (sib === element) {
          return getPositionalXPath(element.parentNode) + "/" + element.tagName.toLowerCase() + "[" + ix + "]";
        }
      }
    }
    return "";
  }

  // smart xpath builder
  function getSmartXPath(element) {
    if (!element || element.nodeType !== 1) return "";

    const tag = (element.tagName || "node").toLowerCase();

    // 1. id
    try {
      const id = element.getAttribute && element.getAttribute("id");
      if (id) return `//${tag}[@id=${escapeForXPathText(id)}]`;
    } catch (e) { /* ignore */ }

    // 2. visible normalized text (small, non-empty)
    try {
      const text = (element.innerText || element.textContent || "").trim();
      if (text && text.length > 0 && text.length <= 60) {
        // ensure not just whitespace/newlines; also avoid heavy blob values
        const singleLine = text.replace(/\s+/g, " ").trim();
        if (singleLine.length > 0 && singleLine.length <= 60) {
          return `//${tag}[normalize-space(text())=${escapeForXPathText(singleLine)}]`;
        }
      }
    } catch (e) { /* ignore */ }

    // 3. class -> use contains() with first stable token (avoid long dynamic lists)
    try {
      const cls = element.className;
      if (cls && typeof cls === "string") {
        const tokens = cls.trim().split(/\s+/).filter(Boolean);
        // pick best token: prefer token with letters (avoid tokens fully numeric/random)
        let picked = null;
        for (const t of tokens) {
          if (/[A-Za-z]/.test(t)) { picked = t; break; }
        }
        if (!picked && tokens.length) picked = tokens[0];
        if (picked && picked.length <= 60) {
          return `//${tag}[contains(@class, ${escapeForXPathText(picked)})]`;
        }
      }
    } catch (e) { /* ignore */ }

    // 4. name attribute
    try {
      const name = element.getAttribute && element.getAttribute("name");
      if (name) return `//${tag}[@name=${escapeForXPathText(name)}]`;
    } catch (e) { /* ignore */ }

    // 5. data-* attributes
    try {
      if (element.attributes) {
        for (let i = 0; i < element.attributes.length; i++) {
          const a = element.attributes[i];
          if (a && a.name && a.name.startsWith("data-") && a.value) {
            return `//${tag}[@${a.name}=${escapeForXPathText(a.value)}]`;
          }
        }
      }
    } catch (e) { /* ignore */ }

    // fallback positional
    const pos = getPositionalXPath(element);
    if (pos) return pos;

    return `//${tag}`;
  }

  // setup listeners
  function onMouseOver(e) {
    if (!window.__xc_enabled) return;
    const el = e.target;
    if (!el || el.nodeType !== 1) return;
    const r = el.getBoundingClientRect();
    highlightBox.style.top = (r.top + window.scrollY) + "px";
    highlightBox.style.left = (r.left + window.scrollX) + "px";
    highlightBox.style.width = Math.max(6, r.width) + "px";
    highlightBox.style.height = Math.max(6, r.height) + "px";
    highlightBox.style.display = "block";
  }

  function onMouseOut(e) {
    if (!window.__xc_enabled) return;
    // keep highlight visible only while hovering over elements; hide on out of document
    const related = e.relatedTarget;
    if (!related || related.nodeType !== 1) {
      highlightBox.style.display = "none";
    }
  }

  async function onClick(e) {
    if (!window.__xc_enabled) return;
    // prevent navigation & propagation so page doesn't change immediately
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;
    const xpath = getSmartXPath(el);
    // try clipboard API
    try {
      await navigator.clipboard.writeText(xpath);
      showToast("XPath copied:\n" + xpath, 2000);
      // store last in chrome.storage if available
      try {
        chrome && chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ __xc_last: xpath });
      } catch (err) { /* ignore */ }
      console.log("[XC] XPath copied:", xpath);
    } catch (err) {
      // fallback: create temp textarea
      try {
        const ta = document.createElement("textarea");
        ta.value = xpath;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showToast("XPath copied (fallback):\n" + xpath, 2000);
      } catch (ex) {
        console.error("[XC] Copy failed", ex);
        showToast("Copy failed. See console.", 2000);
      }
    }
  }

  // add listeners (capturing to get early)
  window.addEventListener("mouseover", onMouseOver, true);
  window.addEventListener("mouseout", onMouseOut, true);
  window.addEventListener("click", onClick, true);

  // message handling for enable/disable
  chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
    if (msg && msg.type === "XC_DISABLE") {
      window.__xc_enabled = false;
      highlightBox.style.display = "none";
      showToast("XPath Copier: Disabled", 1200);
      sendResp && sendResp({ ok: true });
    } else if (msg && msg.type === "XC_ENABLE") {
      window.__xc_enabled = true;
      showToast("XPath Copier: Enabled", 1200);
      sendResp && sendResp({ ok: true });
    }
  });

  // expose a cleanup function (optional)
  window.__xc_cleanup = function() {
    try {
      window.removeEventListener("mouseover", onMouseOver, true);
      window.removeEventListener("mouseout", onMouseOut, true);
      window.removeEventListener("click", onClick, true);
    } catch(e){}
    try { highlightBox.remove(); } catch(e){}
    try { toast.remove(); } catch(e){}
    window.__xpath_click_copier_injected = false;
    showToast("XPath Copier: Unloaded", 1000);
  };
}

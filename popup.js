// popup.js
document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return alert("No active tab found.");
  // inject content script into active tab
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
    // let content script know to enable (in case it exists already)
    chrome.tabs.sendMessage(tab.id, { type: "XC_ENABLE" });
    alert("XPath Click Copier: ENABLED on this page.");
  } catch (err) {
    console.error(err);
    alert("Failed to inject script. See console.");
  }
});

document.getElementById("stop").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return alert("No active tab found.");
  chrome.tabs.sendMessage(tab.id, { type: "XC_DISABLE" }, (resp) => {
    // ignore response
  });
  alert("XPath Click Copier: DISABLED on this page.");
});

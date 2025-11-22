chrome.action.onClicked.addListener((tab) => {
  if (!tab || !tab.id) {
    console.error("[CodePreview] Invalid tab information");
    return;
  }

  chrome.scripting
    .executeScript({
      target: { tabId: tab.id },
      files: ["contentScript.js"],
    })
    .catch((error) => {
      console.error("[CodePreview] Failed to inject content script:", error);
    });
});

// Handle fetch requests from content script as last resort fallback
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || request.action !== "fetchUrl") {
    return;
  }

  if (!request.url) {
    sendResponse({ success: false, error: "No URL provided" });
    return;
  }

  const url = request.url;

  fetch(url)
    .then((response) => {
      if (response.ok) {
        return response.text();
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    })
    .then((html) => {
      sendResponse({ success: true, html: html });
    })
    .catch((error) => {
      console.warn("[CodePreview] Fetch failed for:", url, error.message);
      sendResponse({ success: false, error: error.message });
    });

  // Return true to indicate async response
  return true;
});

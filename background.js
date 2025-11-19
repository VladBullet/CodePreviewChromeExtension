chrome.action.onClicked.addListener((tab) => {
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["contentScript.js"],
  });
});

// Handle fetch requests from content script as last resort fallback
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchUrl") {
    const url = request.url;
    
    fetch(url)
      .then((response) => {
        if (response.ok) {
          return response.text();
        } else {
          throw new Error(`HTTP ${response.status}`);
        }
      })
      .then((html) => {
        sendResponse({ success: true, html: html });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate async response
    return true;
  }
});

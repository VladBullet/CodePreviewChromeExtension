document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("toggleButton");

  // Load initial state from storage
  chrome.storage.local.get(['extensionEnabled'], function(result) {
    toggleButton.checked = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
  });

  // Add event listener to handle button toggle
  toggleButton.addEventListener("change", function () {
    const isEnabled = toggleButton.checked;

    // Save state to storage
    chrome.storage.local.set({ extensionEnabled: isEnabled });

    // Send message to content script to update toggle state
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "setToggleState",
          enabled: isEnabled,
        });
      }
    });
  });
});

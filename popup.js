document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("toggleButton");

  // Send message to content script to get initial toggle state
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    chrome.tabs.sendMessage(tabs[0].id, { action: "getToggleState" }, function (
      response
    ) {
      if (response && response.enabled !== undefined) {
        toggleButton.checked = response.enabled;
      } else {
        toggleButton.checked = true;
      }
    });
  });

  // Add event listener to handle button toggle
  toggleButton.addEventListener("change", function () {
    const isEnabled = toggleButton.checked;

    // Update the button text and state
    toggleButton.checked = isEnabled;

    // Send message to content script to update toggle state
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "setToggleState",
        enabled: isEnabled,
      });
    });
  });
});

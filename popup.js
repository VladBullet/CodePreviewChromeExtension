document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("toggleButton");
  const themeToggle = document.getElementById("themeToggle");

  // Load initial state from storage
  chrome.storage.local.get(
    ["extensionEnabled", "forceDarkTheme"],
    function (result) {
      toggleButton.checked =
        result.extensionEnabled !== undefined ? result.extensionEnabled : true;
      themeToggle.checked = result.forceDarkTheme || false;
    }
  );

  // Add event listener to handle extension toggle
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

  // Add event listener to handle theme toggle
  themeToggle.addEventListener("change", function () {
    const forceDark = themeToggle.checked;

    // Save theme preference to storage
    chrome.storage.local.set({ forceDarkTheme: forceDark });

    // Send message to content script to reload with new theme
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "setTheme",
          forceDark: forceDark,
        });
      }
    });
  });
});

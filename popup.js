document.addEventListener("DOMContentLoaded", function () {
  const toggleButton = document.getElementById("toggleButton");
  const themeToggle = document.getElementById("themeToggle");

  if (!toggleButton || !themeToggle) {
    console.error("[CodePreview] Popup UI elements not found");
    return;
  }

  // Load initial state from storage
  chrome.storage.local.get(
    ["extensionEnabled", "forceDarkTheme"],
    function (result) {
      if (chrome.runtime.lastError) {
        console.error(
          "[CodePreview] Error loading settings:",
          chrome.runtime.lastError
        );
        return;
      }

      toggleButton.checked =
        result.extensionEnabled !== undefined ? result.extensionEnabled : true;
      themeToggle.checked = result.forceDarkTheme || false;
    }
  );

  // Add event listener to handle extension toggle
  toggleButton.addEventListener("change", function () {
    const isEnabled = toggleButton.checked;

    // Save state to storage
    chrome.storage.local.set({ extensionEnabled: isEnabled }, function () {
      if (chrome.runtime.lastError) {
        console.error(
          "[CodePreview] Error saving extension state:",
          chrome.runtime.lastError
        );
        return;
      }

      // Send message to content script to update toggle state
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError) {
          console.error(
            "[CodePreview] Error querying tabs:",
            chrome.runtime.lastError
          );
          return;
        }

        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "setToggleState",
              enabled: isEnabled,
            },
            function (response) {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[CodePreview] Could not send message to tab:",
                  chrome.runtime.lastError.message
                );
              }
            }
          );
        }
      });
    });
  });

  // Add event listener to handle theme toggle
  themeToggle.addEventListener("change", function () {
    const forceDark = themeToggle.checked;

    // Save theme preference to storage
    chrome.storage.local.set({ forceDarkTheme: forceDark }, function () {
      if (chrome.runtime.lastError) {
        console.error(
          "[CodePreview] Error saving theme:",
          chrome.runtime.lastError
        );
        return;
      }

      // Send message to content script to reload with new theme
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        if (chrome.runtime.lastError) {
          console.error(
            "[CodePreview] Error querying tabs:",
            chrome.runtime.lastError
          );
          return;
        }

        if (tabs[0] && tabs[0].id) {
          chrome.tabs.sendMessage(
            tabs[0].id,
            {
              action: "setTheme",
              forceDark: forceDark,
            },
            function (response) {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[CodePreview] Could not send message to tab:",
                  chrome.runtime.lastError.message
                );
              }
            }
          );
        }
      });
    });
  });
});

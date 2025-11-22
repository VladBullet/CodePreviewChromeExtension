let isExtensionEnabled = true;
let forceDarkTheme = false;
let corsProxyUrl = null; // Will be fetched at runtime

// Global tracker to prevent duplicate processing across multiple initializations
if (!window.codePreviewProcessedUrls) {
  window.codePreviewProcessedUrls = new Set();
}
if (!window.codePreviewProcessedContent) {
  window.codePreviewProcessedContent = new Set();
}

// Function to fetch the CORS proxy URL from a remote endpoint
async function getCorsProxyUrl() {
  // Return cached value if already fetched
  if (corsProxyUrl) {
    return corsProxyUrl;
  }

  try {
    // Fetch the proxy URL from your remote endpoint
    const configUrl =
      "https://raw.githubusercontent.com/VladBullet/CodePreviewChromeExtension/master/proxy-config.json";

    const response = await fetch(configUrl, {
      cache: "no-cache",
      headers: { Accept: "application/json" },
    });

    if (response.ok) {
      const config = await response.json();
      if (config && config.corsProxyUrl) {
        corsProxyUrl = config.corsProxyUrl;
        console.log(
          "[CodePreview] Successfully loaded CORS proxy configuration"
        );
        return corsProxyUrl;
      } else {
        throw new Error("Invalid proxy configuration format");
      }
    } else {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    console.warn(
      "[CodePreview] Failed to fetch CORS proxy URL:",
      error.message
    );
    console.log("[CodePreview] Using default proxy fallback");
    // Fallback to a default proxy
    corsProxyUrl = "https://api.allorigins.win/raw?url=";
    return corsProxyUrl;
  }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  try {
    if (!message || !message.action) {
      console.warn("[CodePreview] Received invalid message:", message);
      return;
    }

    if (message.action === "getToggleState") {
      sendResponse({ enabled: isExtensionEnabled });
    } else if (message.action === "setToggleState") {
      if (typeof message.enabled !== "boolean") {
        console.error("[CodePreview] Invalid enabled value:", message.enabled);
        return;
      }

      isExtensionEnabled = message.enabled;
      // Persist state
      chrome.storage.local.set({ extensionEnabled: isExtensionEnabled }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[CodePreview] Failed to save state:",
            chrome.runtime.lastError
          );
        }
      });

      if (isExtensionEnabled) {
        showCodePreviews();
        // Reload the page to process search results
        window.location.reload();
      } else {
        hideCodePreviews();
      }
    } else if (message.action === "setTheme") {
      if (typeof message.forceDark !== "boolean") {
        console.error(
          "[CodePreview] Invalid forceDark value:",
          message.forceDark
        );
        return;
      }

      forceDarkTheme = message.forceDark;
      // Persist theme preference
      chrome.storage.local.set({ forceDarkTheme: forceDarkTheme }, () => {
        if (chrome.runtime.lastError) {
          console.error(
            "[CodePreview] Failed to save theme:",
            chrome.runtime.lastError
          );
        }
      });
      // Reload page to apply new theme
      window.location.reload();
    }
  } catch (error) {
    console.error("[CodePreview] Error handling message:", error);
  }
});

function hideCodePreviews() {
  const codePreviews = document.querySelectorAll(".code-preview-container");
  codePreviews.forEach((preview) => {
    if (preview.parentNode) {
      preview.parentNode.removeChild(preview);
    }
  });
}

function showCodePreviews() {
  const codePreviews = document.getElementsByClassName(
    "code-preview-container"
  );
  for (const preview of codePreviews) {
    preview.style.display = "block";
  }
}

// Initialize extension - load state and process search results
async function initializeExtension() {
  try {
    // Fetch CORS proxy URL first
    await getCorsProxyUrl();

    // Load initial state from storage
    chrome.storage.local.get(
      ["extensionEnabled", "forceDarkTheme"],
      function (result) {
        try {
          isExtensionEnabled =
            result.extensionEnabled !== undefined
              ? result.extensionEnabled
              : true;
          forceDarkTheme = result.forceDarkTheme || false;
          console.log(`[CodePreview] Extension enabled: ${isExtensionEnabled}`);
          console.log(`[CodePreview] Force dark theme: ${forceDarkTheme}`);

          if (!isExtensionEnabled) {
            console.log(
              "[CodePreview] Extension is disabled, skipping processing"
            );
            return;
          }

          // Extension is enabled, process search results
          // Try multiple selectors for different Google layouts
          let searchResults = document.querySelectorAll(".g");

          if (searchResults.length === 0) {
            // Try alternative selector
            searchResults = document.querySelectorAll("div[data-hveid]");
          }

          if (searchResults.length === 0) {
            // Try another alternative
            searchResults = document.querySelectorAll(".MjjYud");
          }

          if (searchResults.length > 0) {
            processSearchResults(searchResults);
          } else {
            console.log("[CodePreview] No search results found on page");
          }
        } catch (error) {
          console.error(
            "[CodePreview] Error processing search results:",
            error
          );
        }
      }
    );
  } catch (error) {
    console.error("[CodePreview] Failed to initialize extension:", error);
  }
}

function processSearchResults(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    console.log("[CodePreview] No search results to process");
    return;
  }

  // Use global trackers to avoid duplicates
  const processedUrls = window.codePreviewProcessedUrls;
  const processedContent = window.codePreviewProcessedContent;

  for (const result of searchResults) {
    try {
      // Skip if this result element has already been processed
      if (result.dataset.previewProcessed === "true") {
        continue;
      }

      const linkElement = result.querySelector('a[href^="http"]');
      if (!linkElement || !linkElement.href) {
        continue;
      }

      if (isCodeURL(linkElement.href)) {
        // Clean URL - remove Google's text fragment highlights and anchors
        const cleanUrl = linkElement.href.split("#")[0];

        // SIMPLE CHECK: Skip if we've already processed this URL
        if (processedUrls.has(cleanUrl)) {
          continue;
        }

        // Mark both the result element AND the URL as processed immediately
        result.dataset.previewProcessed = "true";
        processedUrls.add(cleanUrl);

        const previewContainer = createPreviewContainer();
        previewContainer.setAttribute("data-preview-url", cleanUrl);

        const loadingDiv = createLoadingIndicator();
        previewContainer.appendChild(loadingDiv);

        // Append preview container immediately to show loading state
        appendPreviewContainer(result, previewContainer);

        fetchWithFallback(cleanUrl, corsProxyUrl)
          .then((response) => {
            if (!response) {
              throw new Error("No response received");
            }
            return response.clone().text();
          })
          .then((html) => {
            let codeSnippet = extractTopAnswer(html);
            if (!codeSnippet) codeSnippet = extractCodeSnippetFromHTML(html);

            if (codeSnippet) {
              // Process and clean the code snippet
              codeSnippet = processCodeSnippet(codeSnippet);

              // Remove loading animation
              removeLoadingIndicator(previewContainer);

              const answerUrl = getAnswerUrl(html);
              const language = detectProgrammingLanguage(codeSnippet);

              // Create code elements
              const { preElement, codeElement, isCollapsed, collapsedCode } =
                createCodeElements(codeSnippet, language);

              // Add copy button
              const copyButton = createCopyButton(codeSnippet);
              previewContainer.appendChild(copyButton);
              previewContainer.appendChild(preElement);

              // Add extend/collapse button if needed
              if (isCollapsed) {
                previewContainer.style.position = "relative";
                const extendButton = createExtendButton(
                  codeElement,
                  codeSnippet,
                  collapsedCode
                );
                previewContainer.appendChild(extendButton);
              }

              // Add "Go to Answer" button if URL available
              if (answerUrl) {
                const goToAnswerButton = createGoToAnswerButton(answerUrl);
                previewContainer.appendChild(goToAnswerButton);
              }

              // Apply syntax highlighting
              highlightElement(previewContainer);
            } else {
              // No code found, remove container
              if (previewContainer.parentNode) {
                previewContainer.parentNode.removeChild(previewContainer);
              }
            }
          })
          .catch((error) => {
            handleFetchError(previewContainer, error);
          });
      }
    } catch (exception) {
      console.error("[CodePreview] Error processing search result:", exception);
      // Continue processing other results even if one fails
    }
  }
}

// Start the extension
initializeExtension();

/**
 * Appends preview container intelligently to handle both regular and columnar layouts
 * @param {HTMLElement} result - The search result element
 * @param {HTMLElement} previewContainer - The preview container to append
 */
function appendPreviewContainer(result, previewContainer) {
  // Verify the result element is still in the DOM
  if (!result || !document.body.contains(result)) {
    return;
  }

  // Final check: don't append if this result already has a preview
  if (result.querySelector(".code-preview-container")) {
    return;
  }

  // Check if this is part of a columnar layout (like images grid)
  // Look for parent container that might contain multiple columns
  let targetContainer = result;
  let insertPosition = result;

  // Check if parent has class indicating columnar layout
  const parent = result.parentElement;
  const grandParent = parent?.parentElement;

  // Detect columnar layouts by checking for specific Google classes
  // Images section uses: Lv2Cle, cakeVe, or similar container classes
  const isColumnarLayout =
    parent?.classList.contains("cakeVe") ||
    parent?.classList.contains("Wn3aEc") ||
    grandParent?.classList.contains("Lv2Cle") ||
    grandParent?.classList.contains("Wn3aEc") ||
    (parent?.style.display === "flex" &&
      parent.querySelectorAll("[data-hveid]").length > 1);

  if (isColumnarLayout) {
    // Find the container that spans full width
    // Typically this is 2-3 levels up from individual column items
    let fullWidthContainer = result;
    let current = result.parentElement;
    let depth = 0;

    // Traverse up to find the container that spans the search result width
    while (current && depth < 5) {
      // Check if this container spans the full width
      if (
        current.classList.contains("Lv2Cle") ||
        current.classList.contains("Wn3aEc") ||
        current.getAttribute("jsmodel") === "Wn3aEc"
      ) {
        fullWidthContainer = current;
        break;
      }
      current = current.parentElement;
      depth++;
    }

    // Create a wrapper div to ensure full width and break out of column layout
    const wrapperDiv = document.createElement("div");
    wrapperDiv.style.cssText =
      "width: 100%; clear: both; display: block; margin-top: 10px; grid-column: 1 / -1;";
    wrapperDiv.appendChild(previewContainer);

    // Find the grid/column container (typically has id="iur" or similar)
    let gridContainer = fullWidthContainer.querySelector(
      '#iur, [id^="iur"], .cakeVe'
    );

    if (gridContainer) {
      // Insert AFTER the grid container, not inside it (to avoid appearing as a column)
      // This ensures the preview spans full width below all columns
      if (gridContainer.nextSibling) {
        gridContainer.parentElement.insertBefore(
          wrapperDiv,
          gridContainer.nextSibling
        );
      } else {
        gridContainer.parentElement.appendChild(wrapperDiv);
      }
    } else {
      // Fallback: insert at the end of fullWidthContainer
      // but before any buttons or pagination elements
      const buttons = fullWidthContainer.querySelectorAll(
        'a[class*="more"], button, [role="button"]'
      );
      let insertBeforeElement = null;

      // Find the first button/link that might be "show more"
      for (const btn of buttons) {
        const text = btn.textContent.toLowerCase();
        if (
          text.includes("more") ||
          text.includes("show") ||
          text.includes("all")
        ) {
          insertBeforeElement = btn.parentElement;
          break;
        }
      }

      if (
        insertBeforeElement &&
        fullWidthContainer.contains(insertBeforeElement)
      ) {
        fullWidthContainer.insertBefore(wrapperDiv, insertBeforeElement);
      } else {
        fullWidthContainer.appendChild(wrapperDiv);
      }
    }
  } else {
    // Regular layout - try to find a stable insertion point
    // Look for the main content div within the result
    const contentDiv =
      result.querySelector("[data-content-feature]") ||
      result.querySelector(".VwiC3b") ||
      result;

    // Verify result is still connected before appending
    if (document.body.contains(result)) {
      // Insert after the main content, not inside it
      if (contentDiv && contentDiv.parentElement) {
        contentDiv.parentElement.insertBefore(
          previewContainer,
          contentDiv.nextSibling
        );
      } else {
        result.appendChild(previewContainer);
      }
    }
  }
}

function isCodeURL(url) {
  const codeKeywords = [
    "stackoverflow",
    "github",
    "codepen",
    "code",
    "learn.microsoft",
    "learn",
    "tech",
    "c-sharpcorner",
    "connectionstrings",
    "docker",
    "java",
    "stackexchange",
    "sql",
    "getbootstrap",
    "bootstrap",
    "atlassian",
    "git",
    "linux",
    "debian",
    "ubuntu",
    "tutorial",
  ];
  const codePatterns = [
    /\/blog\//i,
    /\/tutorial\//i,
    /\/code\//i,
    /stackoverflow\.com/i,
    /stackexchange\.com/i,
    /docs\.microsoft\.com/i,
    /learn\.microsoft\.com/i,
    /c-sharpcorner\.com/i,
    /connectionstrings\.com/i,
    /getbootstrap\.com/i,
    /docs\.docker\.com/i,
    /atlassian\.com/i,
    /git-scm\.com/i,
    /tutorialspoint\.com/i,
  ];

  for (const keyword of codeKeywords) {
    if (url.includes(keyword)) {
      return true;
    }
  }

  for (const pattern of codePatterns) {
    if (pattern.test(url)) {
      return true;
    }
  }
  return false;
}

function extractCodeSnippetFromHTML(html) {
  const codeRegex = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
  const preRegex = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;

  let codeSnippet = null;

  // Try pre first (usually contains full code blocks)
  const preMatches = html.match(preRegex);
  if (preMatches && preMatches.length > 0) {
    // Filter out very short snippets (likely not code)
    const validPre = preMatches.filter((match) => {
      const cleaned = match.replace(/<[^>]*>/g, "").trim();
      return cleaned.length > 20; // At least 20 chars
    });

    if (validPre.length > 0) {
      codeSnippet = validPre
        .slice(0, 3) // Take first 3 code blocks
        .map((match) =>
          match.replace(/<\/?pre[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n")
        )
        .join("\n\n");
    }
  }

  if (!codeSnippet) {
    const codeMatches = html.match(codeRegex);
    if (codeMatches && codeMatches.length > 0) {
      codeSnippet = codeMatches
        .slice(0, 5) // Take first 5 code snippets
        .map((match) =>
          match.replace(/<\/?code[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n")
        )
        .join("\n");
    }
  }
  if (codeSnippet) {
    // Replace HTML entities
    codeSnippet = codeSnippet.replace(/&quot;/g, '"');
    codeSnippet = codeSnippet.replace(/&amp;/g, "&");
    codeSnippet = codeSnippet.replace(/&lt;/g, "<");
    codeSnippet = codeSnippet.replace(/&gt;/g, ">");
    codeSnippet = codeSnippet.replace(/&nbsp;/g, " ");
    codeSnippet = codeSnippet.replace(/&copy;/g, "©");
    codeSnippet = codeSnippet.replace(/&reg;/g, "®");
    codeSnippet = codeSnippet.replace(/&ldquo;/g, "“");
    codeSnippet = codeSnippet.replace(/&rdquo;/g, "”");
    codeSnippet = codeSnippet.replace(/&#47;/g, "/");
    // Remove carriage return characters (CR) - both entity and literal
    codeSnippet = codeSnippet.replace(/&#13;/g, "");
    codeSnippet = codeSnippet.replace(/&#x0D;/gi, "");
    codeSnippet = codeSnippet.replace(/\r/g, "");
    // Add more replacements as needed
  }
  return codeSnippet;
}

function highlightElement(codeElement) {
  // Determine theme: if forceDarkTheme is true, use dark; otherwise use light
  const isDarkMode = forceDarkTheme;
  const prismCssFile = isDarkMode ? "lib/prism_dark.css" : "lib/prism.css";
  const prismJsFile = isDarkMode ? "lib/prism_dark.js" : "lib/prism.js";

  // Check if Prism CSS is already loaded
  if (!document.querySelector('link[href*="prism"]')) {
    const linkElement = document.createElement("link");
    linkElement.rel = "stylesheet";
    linkElement.href = chrome.runtime.getURL(prismCssFile);
    document.head.appendChild(linkElement);
  }

  // Check if Prism is already loaded
  if (typeof Prism !== "undefined") {
    // Prism is already loaded, just highlight
    Prism.highlightAllUnder(codeElement);
  } else {
    // Load Prism script if not already loaded
    const prismScript = document.createElement("script");
    prismScript.src = chrome.runtime.getURL(prismJsFile);
    prismScript.onload = () => {
      // Prism is loaded, continue with highlighting
      Prism.highlightAllUnder(codeElement);
    };
    prismScript.onerror = (error) => {
      console.error("[CodePreview] Failed to load Prism script:", error);
    };
    document.head.appendChild(prismScript);
  }
}

function detectProgrammingLanguage(codeSnippet) {
  const snippet = codeSnippet.toLowerCase();
  let scores = {};

  // Score-based detection system - each pattern adds to language score
  const patterns = {
    csharp: [
      { pattern: /\busing\s+system/i, score: 10 },
      { pattern: /\busing\s+\w+(\.\w+)*;/i, score: 7 },
      { pattern: /\bnamespace\s+\w+/i, score: 10 },
      { pattern: /\bconsole\.writeline\(/i, score: 10 },
      { pattern: /\bconsole\.write\(/i, score: 9 },
      { pattern: /\bpublic\s+record\s+\w+/i, score: 10 },
      { pattern: /\brecord\s+\w+\s*\(/i, score: 10 },
      {
        pattern:
          /\b(public|private|protected|internal)\s+(static\s+)?(class|interface|enum|struct|record)\s+\w+/i,
        score: 10,
      },
      {
        pattern:
          /\b(public|private|protected|internal)\s+(static\s+)?(void|string|int|bool|double|float|decimal|long|short|byte|char|object|Task)\s+\w+\s*\(/i,
        score: 9,
      },
      {
        pattern:
          /\b(string|int|bool|double|float|decimal|var|long|short|byte|char|object)\s+\w+\s*=/i,
        score: 6,
      },
      { pattern: /\bnew\s*\([^)]*\);/i, score: 8 },
      {
        pattern:
          /\b(List|Dictionary|ArrayList|HashSet|Queue|Stack|IEnumerable|ICollection)<.+>/i,
        score: 9,
      },
      { pattern: /\basync\s+Task/i, score: 9 },
      { pattern: /\bTask<\w+>/i, score: 9 },
      { pattern: /\bawait\s+\w+\..*\(/i, score: 5 },
      { pattern: /\.net|c#|csharp/i, score: 10 },
      { pattern: /\b(linq|entity|wpf|asp\.net|mvc)\b/i, score: 8 },
      { pattern: /\{\s*get\s*;/i, score: 8 },
      { pattern: /\{\s*set\s*;/i, score: 8 },
      { pattern: /\bget\s*=>/i, score: 7 },
      { pattern: /\binit\s*;/i, score: 8 },
      { pattern: /\[HttpGet\]|\[HttpPost\]|\[Route\]/i, score: 10 },
      { pattern: /\bMain\s*\(\s*\)/i, score: 8 },
      { pattern: /\bstatic\s+void\s+Main/i, score: 10 },
    ],
    javascript: [
      { pattern: /\bconsole\.log\(/i, score: 10 },
      { pattern: /\bconsole\.(warn|error|info|debug)\(/i, score: 9 },
      { pattern: /\bconst\s+\w+\s*=/i, score: 9 },
      { pattern: /\blet\s+\w+\s*=/i, score: 9 },
      { pattern: /\bvar\s+\w+\s*=/i, score: 7 },
      { pattern: /\bfunction\s+\w+\s*\(/i, score: 8 },
      { pattern: /\bfunction\s*\(/i, score: 7 },
      { pattern: /\(\s*\)\s*=>/i, score: 8 },
      { pattern: /\w+\s*=>\s*\{/i, score: 7 },
      { pattern: /\w+\s*=>\s*\w+/i, score: 6 },
      { pattern: /\b(document|window)\./i, score: 10 },
      { pattern: /\bjquery|\$\(/i, score: 9 },
      { pattern: /\basync\s+function/i, score: 8 },
      { pattern: /\basync\s+\w+\s*\(/i, score: 7 },
      { pattern: /\basync\s+\(/i, score: 7 },
      {
        pattern: /\b(npm|node|nodejs|react|vue|angular|express|webpack)\b/i,
        score: 9,
      },
      { pattern: /\.then\(/i, score: 7 },
      { pattern: /\.catch\(/i, score: 7 },
      { pattern: /\.finally\(/i, score: 7 },
      { pattern: /\bnew\s+Promise\(/i, score: 9 },
      { pattern: /require\(['"]/i, score: 9 },
      { pattern: /import\s+.*from\s+['"]/i, score: 9 },
      { pattern: /export\s+(default|const|function|class)/i, score: 9 },
      {
        pattern: /\bsetTimeout|setInterval|clearTimeout|clearInterval\b/i,
        score: 8,
      },
      { pattern: /addEventListener|removeEventListener/i, score: 8 },
      { pattern: /\bJSON\.(parse|stringify)\(/i, score: 8 },
      { pattern: /===|!==|typeof\s+\w+\s+===\s+["']\w+["']/i, score: 6 },
    ],
    python: [
      { pattern: /\bdef\s+\w+\s*\(/i, score: 10 },
      { pattern: /\bimport\s+\w+/i, score: 8 },
      { pattern: /\bfrom\s+\w+\s+import/i, score: 8 },
      { pattern: /\bprint\s*\(/i, score: 8 },
      { pattern: /\b(if|elif|else)\s+.*:/i, score: 6 },
      { pattern: /\bfor\s+\w+\s+in\s+/i, score: 7 },
      { pattern: /\bwhile\s+.*:/i, score: 5 },
      { pattern: /\bclass\s+\w+(\(.*\))?:/i, score: 8 },
      { pattern: /\bself\./i, score: 8 },
      { pattern: /^\s*#.*$/m, score: 3 },
      { pattern: /\b(django|flask|pandas|numpy)\b/i, score: 8 },
    ],
    java: [
      { pattern: /\bpublic\s+(static\s+)?class\s+\w+/i, score: 10 },
      { pattern: /\bpublic\s+static\s+void\s+main\s*\(/i, score: 10 },
      { pattern: /\bsystem\.out\.println\(/i, score: 10 },
      {
        pattern: /\bprivate\s+(static\s+)?(int|string|void|boolean)\b/i,
        score: 7,
      },
      { pattern: /\bimport\s+java\./i, score: 10 },
      { pattern: /\bnew\s+\w+\s*\(/i, score: 4 },
      { pattern: /\b(arraylist|hashmap|string)\s*</i, score: 6 },
      { pattern: /\b@override\b/i, score: 8 },
      { pattern: /\bextends\s+\w+/i, score: 6 },
      { pattern: /\bimplements\s+\w+/i, score: 6 },
    ],
    cpp: [
      { pattern: /\b#include\s*<\w+>/i, score: 10 },
      { pattern: /\bstd::cout\s*<</i, score: 10 },
      { pattern: /\bstd::cin\s*>>/i, score: 10 },
      { pattern: /\busing\s+namespace\s+std/i, score: 10 },
      { pattern: /\bclass\s+\w+\s*\{/i, score: 6 },
      { pattern: /\bpublic:|private:|protected:/i, score: 7 },
      { pattern: /\bvirtual\s+\w+/i, score: 7 },
      { pattern: /\btemplate\s*</i, score: 8 },
      { pattern: /\bstd::(string|vector|map)/i, score: 7 },
    ],
    c: [
      { pattern: /\b#include\s*<(stdio|stdlib|string|math)\.h>/i, score: 10 },
      { pattern: /\bprintf\s*\(/i, score: 9 },
      { pattern: /\bscanf\s*\(/i, score: 9 },
      { pattern: /\bmalloc\s*\(/i, score: 8 },
      { pattern: /\bfree\s*\(/i, score: 7 },
      { pattern: /\bstruct\s+\w+\s*\{/i, score: 7 },
      { pattern: /\bmain\s*\(\s*(void|int\s+argc)/i, score: 6 },
    ],
    html: [
      {
        pattern: /<(!DOCTYPE|html|head|body|div|span|p|a|img|script|style)\b/i,
        score: 10,
      },
      { pattern: /<\/\w+>/i, score: 8 },
      { pattern: /\bclass\s*=\s*["']/i, score: 5 },
      { pattern: /\bid\s*=\s*["']/i, score: 5 },
      { pattern: /<\w+[^>]*>/i, score: 4 },
    ],
    css: [
      { pattern: /\{[^}]*:\s*[^;]+;/i, score: 10 },
      { pattern: /\.([\w-]+)\s*\{/i, score: 8 },
      { pattern: /#([\w-]+)\s*\{/i, score: 7 },
      { pattern: /\b(color|background|margin|padding|font):/i, score: 6 },
      { pattern: /@media|@keyframes|@import/i, score: 8 },
    ],
    sql: [
      { pattern: /\bselect\s+.*\bfrom\b/i, score: 10 },
      { pattern: /\binsert\s+into\b/i, score: 10 },
      { pattern: /\bupdate\s+\w+\s+set\b/i, score: 10 },
      { pattern: /\bdelete\s+from\b/i, score: 10 },
      { pattern: /\bwhere\s+\w+\s*=/i, score: 7 },
      { pattern: /\b(inner|left|right|outer)\s+join\b/i, score: 8 },
      { pattern: /\bcreate\s+(table|database|index)\b/i, score: 9 },
    ],
    json: [
      { pattern: /^\s*\{[\s\S]*\}\s*$/i, score: 10 },
      { pattern: /"\w+"\s*:\s*["\[\{]/i, score: 8 },
      { pattern: /^\s*\[[\s\S]*\]\s*$/i, score: 7 },
    ],
    xml: [
      { pattern: /<\?xml/i, score: 10 },
      { pattern: /<\w+[^>]*>[\s\S]*<\/\w+>/i, score: 7 },
      { pattern: /<\w+[^>]*\/>/i, score: 6 },
    ],
  };

  // Calculate scores for each language
  for (const [language, languagePatterns] of Object.entries(patterns)) {
    scores[language] = 0;
    for (const { pattern, score } of languagePatterns) {
      if (pattern.test(codeSnippet)) {
        scores[language] += score;
      }
    }
  }

  // Find the language with highest score
  let detectedLanguage = "clike"; // default to C-like for generic highlighting
  let maxScore = 0;

  for (const [language, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      detectedLanguage = language;
    }
  }

  // Always return something that highlights - never plain text
  // clike highlights common programming keywords (if, for, while, return, etc.)
  if (maxScore === 0) {
    return "clike";
  } else if (maxScore < 5) {
    return detectedLanguage;
  }

  return detectedLanguage;
}

function extractTopAnswer(responseHTML) {
  let topAnswer = null;

  // List of known programming websites that offer answers and their regex patterns
  const programmingWebsites = [
    {
      domain: "stackoverflow.com",
      regex:
        /<div\s+class="answercell[^"]*"[\s\S]*?<div\s+class="s-prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "github.com",
      regex:
        /<div\s+class="comment-body[^"]*"[^>]*>([\s\S]*?)<\/div>|<div\s+class="markdown-body[^"]*"[^>]*>([\s\S]*?)<\/div>|<article[^>]*class="markdown-body[^"]*"[^>]*>([\s\S]*?)<\/article>/i,
    },
    {
      domain: "stackexchange.com",
      regex:
        /<div\s+class="answercell[^"]*"[\s\S]*?<div\s+class="s-prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "webmasters.stackexchange.com",
      regex:
        /<div\s+class="answercell[^"]*"[\s\S]*?<div\s+class="s-prose[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "learn.microsoft.com",
      regex: /<code\s+class="lang-[^"]*"[^>]*>([\s\S]*?)<\/code>/i,
    },
    {
      domain: "docs.microsoft.com",
      regex: /<code\s+class="lang-[^"]*"[^>]*>([\s\S]*?)<\/code>/i,
    },
    {
      domain: "c-sharpcorner.com",
      regex:
        /<div\s+class="answer-body">\s*<div\s+class="main">\s*([\s\S]*?)<\/div>/i,
    },
    {
      domain: "codeproject.com",
      regex: /<div\s+class="article-content"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "dev.to",
      regex: /<div\s+class="article-body"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "reddit.com",
      regex: /<code[^>]*>([\s\S]*?)<\/code>/i,
    },
    {
      domain: "dzone.com",
      regex: /<div\s+class="body"[^>]*>([\s\S]*?)<\/div>/i,
    },
    // Add more websites and their respective regex patterns as needed
  ];

  for (const website of programmingWebsites) {
    const { domain, regex } = website;

    if (responseHTML.includes(domain)) {
      const matches = responseHTML.match(regex);

      if (matches) {
        // Find the first non-undefined capture group (for regex with multiple alternatives)
        for (let i = 1; i < matches.length; i++) {
          if (matches[i]) {
            topAnswer = matches[i];
            break;
          }
        }
        if (topAnswer) break;
      }
    }
  }

  return topAnswer;
}

function replaceHtmlCharacters(codeSnippet) {
  const heScript = document.createElement("script");
  heScript.src = chrome.runtime.getURL("lib/he.js");
  heScript.onload = () => {
    // Use he library to decode HTML entities
    const he = window.he || require("he");
    if (codeSnippet) {
      codeSnippet = he.decode(codeSnippet);
    }
  };
  return codeSnippet;
}

function getAnswerUrl(html) {
  // Identify the answer URL based on the specific website's HTML structure
  // Modify the code below to match the structure of the HTML and the targeted website(s)

  // Example for Stack Overflow
  const stackOverflowAnswerMatch = html.match(
    /https?:\/\/stackoverflow\.com\/questions\/\d+/
  );
  if (stackOverflowAnswerMatch) {
    return stackOverflowAnswerMatch[0];
  }

  // Example for GitHub
  const githubAnswerMatch = html.match(
    /https?:\/\/github\.com\/.+\/issues\/\d+/
  );
  if (githubAnswerMatch) {
    return githubAnswerMatch[0];
  }

  // Example for Microsoft Docs
  const microsoftDocsAnswerMatch = html.match(
    /https?:\/\/docs\.microsoft\.com\/.+\/\d+/
  );
  if (microsoftDocsAnswerMatch) {
    return microsoftDocsAnswerMatch[0];
  }

  // Example for Stack Exchange
  const stackExchangeAnswerMatch = html.match(
    /https?:\/\/(?:\w+\.)?stackexchange\.com\/questions\/\d+/
  );
  if (stackExchangeAnswerMatch) {
    return stackExchangeAnswerMatch[0];
  }

  // Example for Learn Microsoft
  const learnMicrosoftAnswerMatch = html.match(
    /https?:\/\/learn\.microsoft\.com\/[^"'\s<>]+/
  );
  if (learnMicrosoftAnswerMatch) {
    return learnMicrosoftAnswerMatch[0];
  }

  // Example for Docs Microsoft
  const docsMicrosoftAnswerMatch = html.match(
    /https?:\/\/docs\.microsoft\.com\/[^"'\s<>]+/
  );
  if (docsMicrosoftAnswerMatch) {
    return docsMicrosoftAnswerMatch[0];
  }

  // Example for C# Corner
  const csharpCornerAnswerMatch = html.match(
    /https?:\/\/www\.c-sharpcorner\.com\/.+\/\d+/
  );
  if (csharpCornerAnswerMatch) {
    return csharpCornerAnswerMatch[0];
  }

  // Example for CodeProject
  const codeProjectAnswerMatch = html.match(
    /https?:\/\/www\.codeproject\.com\/\w+\/\d+/
  );
  if (codeProjectAnswerMatch) {
    return codeProjectAnswerMatch[0];
  }

  // Example for Dev.to
  const devtoAnswerMatch = html.match(/https?:\/\/dev\.to\/.+\/\w+/);
  if (devtoAnswerMatch) {
    return devtoAnswerMatch[0];
  }

  // Example for Reddit
  const redditAnswerMatch = html.match(
    /https?:\/\/www\.reddit\.com\/r\/\w+\/comments\/\w+\/\w+/
  );
  if (redditAnswerMatch) {
    return redditAnswerMatch[0];
  }

  // Example for DZone
  const dzoneAnswerMatch = html.match(/https?:\/\/dzone\.com\/articles\/\w+/);
  if (dzoneAnswerMatch) {
    return dzoneAnswerMatch[0];
  }

  // Add more conditions with appropriate regular expressions for other programming websites as needed

  // Return null if no answer URL is found
  return null;
}

function removeCodeAnnotations(text) {
  // Remove common annotations that appear in code snippets from websites

  // Remove "CR LF", "LF", "CR" labels that appear at line endings or standalone
  text = text.replace(/\s*(CR\s*LF|CRLF)\s*/gi, "");

  // More aggressive LF/CR removal at line ends and as standalone text
  text = text.replace(/\s+LF\s*$/gm, ""); // LF at end of lines
  text = text.replace(/^\s*LF\s+/gm, ""); // LF at start of lines
  text = text.replace(/\s+LF\s+/g, " "); // LF in middle with spaces
  text = text.replace(/\bLF\b/g, ""); // Any remaining standalone LF

  text = text.replace(/\s+CR\s*$/gm, ""); // CR at end of lines
  text = text.replace(/^\s*CR\s+/gm, ""); // CR at start of lines
  text = text.replace(/\s+CR\s+/g, " "); // CR in middle with spaces
  text = text.replace(/\bCR\b/g, ""); // Any remaining standalone CR

  // Remove line number annotations like "1:", "2:", etc at start of lines
  text = text.replace(/^\s*\d+:\s*/gm, "");

  // Remove copy/paste buttons text that might be in the snippet
  text = text.replace(/\[?copy\]?/gi, "");
  text = text.replace(/\[?copied\]?/gi, "");

  // Remove "Show more" or similar UI text
  text = text.replace(/\s*(show more|see more|read more|view more)\s*/gi, "");

  return text;
}

function removeDuplicateLineBreaks(text) {
  return text.replace(/\n+/g, "\n");
}

function containsCodeHtmlTags(snippet) {
  // Check if the snippet contains HTML/XML tags that are likely part of the code
  // rather than formatting tags like <p>, <pre>, <code>, <a>

  // Remove formatting tags first to check the actual content
  let contentOnly = snippet
    .replace(/<\/?p[^>]*>/gi, "")
    .replace(/<\/?pre[^>]*>/gi, "")
    .replace(/<\/?code[^>]*>/gi, "")
    .replace(/<\/?strong[^>]*>/gi, "")
    .replace(/<\/?em[^>]*>/gi, "")
    .replace(/<\/?b[^>]*>/gi, "")
    .replace(/<\/?i[^>]*>/gi, "")
    .replace(/<a[^>]*>.*?<\/a>/gi, "");

  // Common HTML elements used in web development code
  const codeHtmlPatterns = [
    // Web development HTML tags
    /<(div|span|input|button|form|table|tr|td|th|select|option|textarea|label|img|ul|ol|li|nav|header|footer|section|article|aside|main|figure|figcaption|video|audio|canvas|svg|iframe|script|style|link|meta|title|body|html|head)[^>]*>/i,
    // Check for JSX/React patterns
    /<[A-Z][a-zA-Z0-9]*[^>]*>/,
    // Check for template literals with HTML
    /`[^`]*<[a-z][^>]*>/i,
    // Check for innerHTML/outerHTML assignments
    /(innerHTML|outerHTML)\s*=/,
    // Check for document.createElement
    /document\.createElement\s*\(/,
    // Check for HTML strings in quotes
    /["']<[a-z][^>]*>.*<\/[a-z]+>["']/i,
    // Check for template strings with tags
    /\$\{[^}]*<[a-z]/i,
  ];

  // Test against the content without formatting tags
  return codeHtmlPatterns.some((pattern) => pattern.test(contentOnly));
}

function cleanHtmlTags(html) {
  let text = html;

  // Convert common HTML tags to readable format
  text = text.replace(/<p[^>]*>/gi, "\n");
  text = text.replace(/<\/p>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<div[^>]*>/gi, "\n");
  text = text.replace(/<\/div>/gi, "\n");
  text = text.replace(/<h[1-6][^>]*>/gi, "\n\n## ");
  text = text.replace(/<\/h[1-6]>/gi, "\n");
  text = text.replace(/<li[^>]*>/gi, "\n• ");
  text = text.replace(/<\/li>/gi, "");
  text = text.replace(/<ul[^>]*>/gi, "\n");
  text = text.replace(/<\/ul>/gi, "\n");
  text = text.replace(/<ol[^>]*>/gi, "\n");
  text = text.replace(/<\/ol>/gi, "\n");

  // Convert links to readable format: [text](url)
  text = text.replace(
    /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi,
    "$2 ($1)"
  );

  // Convert code tags
  text = text.replace(/<code[^>]*>/gi, "`");
  text = text.replace(/<\/code>/gi, "`");
  text = text.replace(/<pre[^>]*>/gi, "\n```\n");
  text = text.replace(/<\/pre>/gi, "\n```\n");

  // Convert formatting tags
  text = text.replace(/<strong[^>]*>|<b[^>]*>/gi, "**");
  text = text.replace(/<\/strong>|<\/b>/gi, "**");
  text = text.replace(/<em[^>]*>|<i[^>]*>/gi, "*");
  text = text.replace(/<\/em>|<\/i>/gi, "*");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&copy;/g, "©");
  text = text.replace(/&reg;/g, "®");
  text = text.replace(/&ldquo;/g, '"');
  text = text.replace(/&rdquo;/g, '"');
  text = text.replace(/&#47;/g, "/");
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&apos;/g, "'");
  text = text.replace(/&hellip;/g, "...");
  text = text.replace(/&mdash;/g, "—");
  text = text.replace(/&ndash;/g, "–");
  // Remove carriage return characters (CR) - both entity and literal
  text = text.replace(/&#13;/g, "");
  text = text.replace(/&#x0D;/gi, "");
  text = text.replace(/\r/g, "");

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, "\n\n"); // Max 2 line breaks
  text = text.trim();

  return text;
}

// Safer chrome.scripting fallback - uses executeScript instead of iframe
async function fetchViaScripting(url) {
  return new Promise((resolve, reject) => {
    // Send message to background script to fetch content
    chrome.runtime.sendMessage({ action: "fetchUrl", url: url }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (response && response.success) {
        // Return a Response-like object
        resolve({
          ok: true,
          status: 200,
          text: async () => response.html,
          clone: function () {
            return this;
          },
        });
      } else {
        reject(new Error(response?.error || "Unknown error"));
      }
    });
  });
}

async function copyToClipboard(text, button) {
  try {
    await navigator.clipboard.writeText(text);

    // Add checkmark animation
    if (button) {
      const originalText = button.innerText;
      const originalWidth = button.offsetWidth + "px";
      button.style.width = originalWidth;
      button.style.textAlign = "center";
      button.innerText = "✓";
      button.classList.add("copied");
      setTimeout(() => {
        button.innerText = originalText;
        button.style.width = "";
        button.style.textAlign = "";
        button.classList.remove("copied");
      }, 1500);
    }
  } catch (error) {
    console.error("[CodePreview] Failed to copy to clipboard:", error);

    // Fallback for older browsers or permission issues
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);

      if (button) {
        const originalText = button.innerText;
        button.innerText = "✓";
        button.classList.add("copied");
        setTimeout(() => {
          button.innerText = originalText;
          button.classList.remove("copied");
        }, 1500);
      }
    } catch (fallbackError) {
      console.error("[CodePreview] Fallback copy also failed:", fallbackError);
      if (button) {
        const originalText = button.innerText;
        button.innerText = "Failed";
        setTimeout(() => {
          button.innerText = originalText;
        }, 1500);
      }
    }
  }
}

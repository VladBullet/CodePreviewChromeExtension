// Helper functions for content script - separated for better maintainability

/**
 * Creates a loading indicator for the preview container
 * @returns {HTMLElement} The loading div element
 */
function createLoadingIndicator() {
  const loadingDiv = document.createElement("div");
  loadingDiv.classList.add("code-preview-loading");
  loadingDiv.innerHTML = `
    <div class="loading-spinner"></div>
    <span>Code preview loading...</span>
  `;
  return loadingDiv;
}

/**
 * Creates and configures a preview container
 * @returns {HTMLElement} The configured preview container
 */
function createPreviewContainer() {
  const previewContainer = document.createElement("div");
  previewContainer.classList.add("code-preview-container");
  previewContainer.classList.add("code-snippet-container");
  return previewContainer;
}

/**
 * Processes and cleans the code snippet
 * @param {string} codeSnippet - Raw code snippet
 * @returns {string} Cleaned and formatted code snippet
 */
function processCodeSnippet(codeSnippet) {
  // Smart detection: preserve HTML tags if they appear to be part of the code
  const shouldPreserveHtml = containsCodeHtmlTags(codeSnippet);

  if (!shouldPreserveHtml) {
    codeSnippet = cleanHtmlTags(codeSnippet);
  }
  codeSnippet = replaceHtmlCharacters(codeSnippet);

  // Remove common code snippet annotations and formatting artifacts
  codeSnippet = removeCodeAnnotations(codeSnippet);

  // Detect language before applying formatting
  const detectedLang = detectProgrammingLanguage(codeSnippet);

  // Only add line breaks after semicolons for languages that use them
  if (!["json", "html", "css", "sql", "xml"].includes(detectedLang)) {
    codeSnippet = codeSnippet.replace(/;/g, ";\n");
  }

  codeSnippet = removeDuplicateLineBreaks(codeSnippet);

  return codeSnippet;
}

/**
 * Creates a copy button with event handler
 * @param {string} codeSnippet - The code to copy
 * @returns {HTMLElement} The configured button element
 */
function createCopyButton(codeSnippet) {
  const button = document.createElement("button");
  button.innerText = "Copy to Clipboard";
  button.classList.add("copy-button");
  button.addEventListener("click", () => {
    copyToClipboard(codeSnippet, button);
  });
  return button;
}

/**
 * Creates an extend/collapse button for long code snippets
 * @param {HTMLElement} codeElement - The code element to expand/collapse
 * @param {string} fullCode - The full code snippet
 * @param {string} collapsedCode - The collapsed version of the code
 * @returns {HTMLElement} The configured extend button
 */
function createExtendButton(codeElement, fullCode, collapsedCode) {
  const extendButton = document.createElement("button");
  extendButton.innerText = "Expand";
  extendButton.classList.add("extend-button");
  extendButton.style.position = "absolute";
  extendButton.style.bottom = "10px";
  extendButton.style.right = "10px";
  extendButton.style.padding = "5px 15px";
  extendButton.style.cursor = "pointer";
  extendButton.style.zIndex = "10";

  extendButton.addEventListener("click", () => {
    const currentCode = codeElement.textContent;

    if (currentCode === collapsedCode || extendButton.innerText === "Expand") {
      // Expand
      codeElement.textContent = fullCode;
      extendButton.innerText = "Collapse";
    } else {
      // Collapse
      codeElement.textContent = collapsedCode;
      extendButton.innerText = "Expand";
    }

    // Re-highlight after changing content
    if (typeof Prism !== "undefined") {
      Prism.highlightElement(codeElement);
    }
  });

  return extendButton;
}

/**
 * Creates a "Go to Answer" link button
 * @param {string} answerUrl - URL to link to
 * @returns {HTMLElement} The configured link element
 */
function createGoToAnswerButton(answerUrl) {
  const goToAnswerButton = document.createElement("a");
  goToAnswerButton.classList.add("go-to-answer-button");
  goToAnswerButton.classList.add("text-center");
  goToAnswerButton.href = answerUrl;
  goToAnswerButton.target = "_blank";
  goToAnswerButton.rel = "noopener noreferrer";
  goToAnswerButton.textContent = "Go to Answer";
  return goToAnswerButton;
}

/**
 * Creates code preview elements (pre and code tags)
 * @param {string} codeSnippet - The code to display
 * @param {string} language - Detected programming language
 * @param {number} maxLines - Maximum lines to show initially
 * @returns {Object} Object containing preElement, codeElement, and isCollapsed flag
 */
function createCodeElements(codeSnippet, language, maxLines = 15) {
  const preElement = document.createElement("pre");
  const codeElement = document.createElement("code");

  // The code element needs the language class for Prism
  const finalLanguage = language || "clike";
  codeElement.classList.add("language-" + finalLanguage);

  // Limit to maxLines by default
  const lines = codeSnippet.split("\n");
  const isCollapsed = lines.length > maxLines;

  if (isCollapsed) {
    codeElement.textContent = lines.slice(0, maxLines).join("\n");
  } else {
    codeElement.textContent = codeSnippet;
  }

  // Style the pre element
  preElement.style.whiteSpace = "pre-wrap";
  preElement.style.wordBreak = "break-word";
  preElement.style.overflowWrap = "break-word";
  preElement.style.paddingTop = "30px";
  preElement.style.maxWidth = "100%";
  preElement.style.overflow = "auto";
  if (isCollapsed) {
    preElement.style.maxHeight = "none";
  }

  // Correct structure: pre > code
  preElement.appendChild(codeElement);

  return {
    preElement,
    codeElement,
    isCollapsed,
    lines,
    collapsedCode: lines.slice(0, maxLines).join("\n"),
  };
}

/**
 * Attempts to fetch URL with multiple fallback strategies
 * @param {string} url - URL to fetch
 * @param {string} corsProxyUrl - Primary CORS proxy URL
 * @returns {Promise<Response>} Response object
 */
async function fetchWithFallback(url, corsProxyUrl) {
  // Clean URL for fetching
  const fetchUrl = url.split("#:~:text=")[0].split("#")[0];

  // Try direct fetch first (CORS errors are expected and will be caught silently)
  try {
    const response = await fetch(fetchUrl, { mode: "cors" });
    if (response.ok) {
      return response;
    }
  } catch (e) {
    // Expected CORS failure - browser will log this but we handle it gracefully
    // The console error is a browser security feature and cannot be suppressed
  }

  // Try multiple proxy options
  const proxies = [
    corsProxyUrl,
    "https://api.allorigins.win/raw?url=",
    "https://cors-anywhere.herokuapp.com/",
  ].filter(Boolean);

  for (const proxyUrl of proxies) {
    try {
      const response = await fetch(proxyUrl + encodeURIComponent(fetchUrl));
      if (response.ok) {
        return response;
      }
    } catch (e) {
      // Continue to next proxy silently
    }
  }

  // Last resort: try chrome.scripting API
  try {
    const scriptResponse = await fetchViaScripting(fetchUrl);
    if (scriptResponse) {
      return scriptResponse;
    }
  } catch (scriptError) {
    // Final fallback failed
  }

  throw new Error("Unable to fetch content - all methods failed");
}

/**
 * Handles fetch errors gracefully by removing the loading container
 * @param {HTMLElement} previewContainer - The preview container to remove
 * @param {Error} error - The error that occurred
 */
function handleFetchError(previewContainer, error) {
  // Silently handle fetch failures - many sites have CORS restrictions
  // Only log for debugging purposes
  console.debug(`[CodePreview] ${error.message}`);

  // Remove loading container
  if (previewContainer && previewContainer.parentNode) {
    previewContainer.parentNode.removeChild(previewContainer);
  }
}

/**
 * Removes loading indicator from preview container
 * @param {HTMLElement} previewContainer - Container with loading indicator
 */
function removeLoadingIndicator(previewContainer) {
  const loadingDiv = previewContainer.querySelector(".code-preview-loading");
  if (loadingDiv) {
    loadingDiv.remove();
  }
}

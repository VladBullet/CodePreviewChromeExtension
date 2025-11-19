let isExtensionEnabled = true;

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "getToggleState") {
    sendResponse({ enabled: isExtensionEnabled });
  } else if (message.action === "setToggleState") {
    isExtensionEnabled = message.enabled;
    if (isExtensionEnabled) {
      showCodePreviews();
    } else {
      hideCodePreviews();
    }
  }
});

function hideCodePreviews() {
  const codePreviews = document.getElementsByClassName(
    "code-preview-container"
  );
  for (const preview of codePreviews) {
    preview.style.display = "none";
  }
}

function showCodePreviews() {
  const codePreviews = document.getElementsByClassName(
    "code-preview-container"
  );
  for (const preview of codePreviews) {
    preview.style.display = "block";
  }
}

// --------------------------------------------------------------------
// Try multiple selectors for different Google layouts
let searchResults = document.querySelectorAll(".g");
console.log(
  `[CodePreview] Found ${searchResults.length} search results with .g selector`
);

if (searchResults.length === 0) {
  // Try alternative selector
  searchResults = document.querySelectorAll("div[data-hveid]");
  console.log(
    `[CodePreview] Trying alternative selector: found ${searchResults.length} results`
  );
}

if (searchResults.length === 0) {
  // Try another alternative
  searchResults = document.querySelectorAll(".MjjYud");
  console.log(
    `[CodePreview] Trying .MjjYud selector: found ${searchResults.length} results`
  );
}

console.log(`[CodePreview] Processing ${searchResults.length} search results`);

// Track processed URLs and content to avoid duplicates
const processedUrls = new Set();
const processedContent = new Set();

for (const result of searchResults) {
  try {
    const linkElement = result.querySelector('a[href^="http"]');
    if (linkElement && isCodeURL(linkElement.href)) {
      // Skip if already processed
      if (processedUrls.has(linkElement.href)) {
        console.log(
          `[CodePreview] Skipping duplicate URL: ${linkElement.href}`
        );
        continue;
      }
      processedUrls.add(linkElement.href);
      console.log(`[CodePreview] Processing code URL: ${linkElement.href}`);
      const previewContainer = document.createElement("div");
      previewContainer.classList.add("code-preview-container");
      previewContainer.classList.add("code-snippet-container");

      // Try direct fetch first, then fallback to proxy
      const tryFetch = async (url) => {
        // Try direct fetch first
        try {
          console.log(`[CodePreview] Trying direct fetch: ${url}`);
          const response = await fetch(url, { mode: "cors" });
          if (response.ok) {
            console.log(`[CodePreview] Direct fetch succeeded!`);
            return response;
          }
        } catch (e) {
          console.log(
            `[CodePreview] Direct fetch failed (expected for CORS): ${e.message}`
          );
        }

        // Try multiple proxy options
        const proxies = [
          "https://corsproxyanywhere.onrender.com/",
          "https://api.allorigins.win/raw?url=",
          "https://cors-anywhere.herokuapp.com/",
        ];

        for (const proxyUrl of proxies) {
          try {
            console.log(`[CodePreview] Trying proxy: ${proxyUrl}`);
            const response = await fetch(proxyUrl + encodeURIComponent(url));
            if (response.ok) {
              console.log(`[CodePreview] Proxy ${proxyUrl} succeeded!`);
              return response;
            }
          } catch (e) {
            console.log(`[CodePreview] Proxy ${proxyUrl} failed: ${e.message}`);
          }
        }

        // Final fallback: Use chrome.scripting API to fetch in a new context
        if (document.body) {
          console.log(
            `[CodePreview] All proxies failed, trying chrome.scripting API fallback`
          );
          try {
            const response = await fetchViaScripting(url);
            if (response) {
              console.log(`[CodePreview] chrome.scripting API succeeded!`);
              return response;
            }
          } catch (e) {
            console.log(
              `[CodePreview] chrome.scripting API failed: ${e.message}`
            );
          }
        } else {
          console.log(
            `[CodePreview] Skipping iframe fallback: document.body not available`
          );
        }

        throw new Error("All fetch methods failed");
      };

      tryFetch(linkElement.href)
        .then((response) => {
          if (!response) {
            throw new Error("No response received");
          }
          console.log(
            `[CodePreview] Fetch response status: ${response.status}`
          );
          return response.clone().text();
        })
        .then((html) => {
          console.log(`[CodePreview] HTML received, length: ${html.length}`);

          let codeSnippet = extractTopAnswer(html);
          console.log(`[CodePreview] Top answer found: ${!!codeSnippet}`);
          if (!codeSnippet) codeSnippet = extractCodeSnippetFromHTML(html);
          console.log(`[CodePreview] Code snippet found: ${!!codeSnippet}`);
          if (codeSnippet) {
            codeSnippet = cleanHtmlTags(codeSnippet);
            codeSnippet = replaceHtmlCharacters(codeSnippet);
            codeSnippet = codeSnippet.replace(/;/g, ";\n");
            codeSnippet = removeDuplicateLineBreaks(codeSnippet);

            // Check if we've already displayed this exact content
            const contentHash = codeSnippet.trim().substring(0, 200);
            if (processedContent.has(contentHash)) {
              console.log(
                `[CodePreview] Skipping duplicate content from ${linkElement.href}`
              );
              return;
            }
            processedContent.add(contentHash);

            const answerUrl = getAnswerUrl(html);
            // Create a <link> element for the Prism theme CSS
            var language = detectProgrammingLanguage(codeSnippet);
            // previewContainer.style.border = "1px solid #ccc";
            // previewContainer.style.borderRadius = "15px";
            // previewContainer.style.padding = "5px";

            const codeElement = document.createElement("code");
            const preElement = document.createElement("pre");
            preElement.innerText = codeSnippet;
            preElement.classList.add("language-" + language);
            preElement.style.whiteSpace = "pre-wrap";
            preElement.style.wordBreak = "break-all";
            preElement.style.paddingTop = "30px";

            // Limit to 15 lines by default
            const lines = codeSnippet.split("\n");
            const maxLines = 15;
            let isCollapsed = lines.length > maxLines;

            if (isCollapsed) {
              preElement.innerText = lines.slice(0, maxLines).join("\n");
              preElement.style.maxHeight = "none";
            }

            codeElement.appendChild(preElement);

            const button = document.createElement("button");
            button.innerText = "Copy to Clipboard";
            button.classList.add("copy-button");
            previewContainer.appendChild(button);

            previewContainer.appendChild(codeElement);

            button.addEventListener("click", () => {
              copyToClipboard(codeSnippet, button);
            });

            // Add Extend button if content is collapsed
            if (isCollapsed) {
              const extendButton = document.createElement("button");
              extendButton.innerText = "Extend";
              extendButton.classList.add("extend-button");
              extendButton.style.position = "absolute";
              extendButton.style.bottom = "10px";
              extendButton.style.right = "10px";
              extendButton.style.padding = "5px 15px";
              extendButton.style.cursor = "pointer";
              extendButton.style.zIndex = "10";

              // Make preview container relative for absolute positioning
              previewContainer.style.position = "relative";

              extendButton.addEventListener("click", () => {
                if (
                  preElement.innerText === lines.slice(0, maxLines).join("\n")
                ) {
                  // Expand
                  preElement.innerText = codeSnippet;
                  extendButton.innerText = "Collapse";
                  highlightElement(previewContainer);
                } else {
                  // Collapse
                  preElement.innerText = lines.slice(0, maxLines).join("\n");
                  extendButton.innerText = "Extend";
                  highlightElement(previewContainer);
                }
              });

              previewContainer.appendChild(extendButton);
            }

            if (answerUrl) {
              const goToAnswerButton = document.createElement("a");
              goToAnswerButton.classList.add("go-to-answer-button");
              goToAnswerButton.classList.add("text-center");
              goToAnswerButton.href = answerUrl;
              goToAnswerButton.target = "_blank";
              goToAnswerButton.rel = "noopener noreferrer";
              goToAnswerButton.textContent = "Go to Answer";
              previewContainer.appendChild(goToAnswerButton);
            }
          } else {
            console.log(`[CodePreview] No code found for ${linkElement.href}`);
            previewContainer.textContent = "Code Preview not available.";
          }
        })
        .catch((error) => {
          console.error(`[CodePreview] Fetch error:`, error);
          previewContainer.textContent =
            "Failed to load preview (proxy error).";
        });
      result.appendChild(previewContainer);
      highlightElement(previewContainer);
    }
  } catch (exception) {
    console.error(exception);
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
    console.log(`[CodePreview] Found ${preMatches.length} <pre> tags`);
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
      console.log(`[CodePreview] Found ${codeMatches.length} <code> tags`);
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
    // Add more replacements as needed
  }
  if (codeSnippet && codeSnippet.length > 1000) {
    codeSnippet = codeSnippet.substring(0, 1000) + " ...";
  }
  return codeSnippet;
}

function highlightElement(codeElement) {
  const linkElement = document.createElement("link");
  linkElement.rel = "stylesheet";
  linkElement.href = chrome.runtime.getURL("lib/prism.css");
  document.head.appendChild(linkElement);

  const prismScript = document.createElement("script");
  prismScript.src = chrome.runtime.getURL("lib/prism.js");
  prismScript.onload = () => {
    // Prism is loaded, continue with highlighting
    // Apply syntax highlighting
    Prism.highlightAllUnder(codeElement);

    // Move the highlighted code element to the preview container
  };
}
// function detectProgrammingLanguage1(codeSnippet) {
//   // Define regular expressions for language detection
//   const languageRegexMap = [
//     {
//       language: "javascript",
//       regex: /(?:\b|['"\s])(?:javascript|js|node\.?js)\b/gi,
//     },
//     { language: "java", regex: /(?:\b|['"\s])(?:java|jdk)\b/gi },
//     { language: "python", regex: /(?:\b|['"\s])(?:python|py)\b/gi },
//     { language: "html", regex: /(?:\b|['"\s])(?:html|html5|htm)\b/gi },
//     { language: "csharp", regex: /(?:\b|['"\s])(?:c#|\.net|csharp)\b/gi },
//     { language: "c", regex: /(?:\b|['"\s])(?:c|c-lang|clang)\b/gi },
//     { language: "cpp", regex: /(?:\b|['"\s])(?:c\+\+|cpp)\b/gi },
//     // Add more language regex patterns as needed
//   ];

//   // Match against the regular expressions
//   for (const { language, regex } of languageRegexMap) {
//     if (regex.test(codeSnippet)) {
//       return language;
//     }
//   }

//   // If no specific language is detected, assume it's plain text or unknown
//   return "javascript";
// }
function detectProgrammingLanguage(codeSnippet) {
  // Define regular expressions for language detection
  const languageRegexMap = [
    {
      language: "javascript",
      regex:
        /(?:\b|['"\s])(?:javascript|js|node\.?js|console\.log|function|var|let|const|if|for|while)\b/gi,
    },
    {
      language: "java",
      regex:
        /(?:\b|['"\s])(?:java|jdk|System\.out\.println|public|class|void|static|import|new)\b/gi,
    },
    {
      language: "python",
      regex:
        /(?:\b|['"\s])(?:python|py|print|def|if|for|while|import|from|class|self)\b/gi,
    },
    {
      language: "html",
      regex:
        /(?:\b|['"\s])(?:html|html5|htm|<!DOCTYPE html>|<html>|<head>|<body>|<div>|<p>|<a>|<img>)\b/gi,
    },
    {
      language: "csharp",
      regex:
        /(?:\b|['"\s])(?:c#|\.net|csharp|Console\.WriteLine|public|class|void|static|using|namespace)\b/gi,
    },
    {
      language: "c",
      regex:
        /(?:\b|['"\s])(?:c|c-lang|clang|#include|printf|scanf|int|float|char|for|while)\b/gi,
    },
    {
      language: "cpp",
      regex:
        /(?:\b|['"\s])(?:c\+\+|cpp|#include|cout|cin|class|public|private|void|using|namespace)\b/gi,
    },
    // Add more language regex patterns as needed
  ];

  // Match against the regular expressions
  for (const { language, regex } of languageRegexMap) {
    regex.lastIndex = 0; // Reset the lastIndex property
    if (regex.test(codeSnippet)) {
      return language;
    }
  }

  // If no specific language is detected, assume it's plaintext or unknown
  return "plaintext";
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
      console.log(`[CodePreview] Trying to extract from ${domain}`);
      const matches = responseHTML.match(regex);

      if (matches) {
        // Find the first non-undefined capture group (for regex with multiple alternatives)
        for (let i = 1; i < matches.length; i++) {
          if (matches[i]) {
            console.log(
              `[CodePreview] Successfully extracted answer from ${domain}, length: ${matches[i].length}`
            );
            topAnswer = matches[i];
            break;
          }
        }
        if (topAnswer) break;
      } else {
        console.log(`[CodePreview] No match found for ${domain}`);
      }
    }
  }

  return topAnswer;
}
function extractTopAnswer2(html) {
  // Identify the top answer based on the specific website's HTML structure
  // Modify the code below to match the structure of the HTML and the targeted website(s)

  // Example for Stack Overflow
  const stackOverflowRegex =
    /<div class="js-post-body[\s\S]*?>([\s\S]*?)<\/div>/i;
  const stackOverflowMatch = html.match(stackOverflowRegex);
  if (stackOverflowMatch) {
    return stackOverflowMatch[1];
  }

  // Example for GitHub
  const githubRegex = /<div class="comment-body[\s\S]*?>([\s\S]*?)<\/div>/i;
  const githubMatch = html.match(githubRegex);
  if (githubMatch) {
    return githubMatch[1];
  }

  // Example for Microsoft Docs
  const microsoftDocsRegex =
    /<div class="codeSnippetContainer[\s\S]*?>([\s\S]*?)<\/div>/i;
  const microsoftDocsMatch = html.match(microsoftDocsRegex);
  if (microsoftDocsMatch) {
    return microsoftDocsMatch[1];
  }

  // Add more conditions with appropriate regex patterns for other programming websites as needed

  // Return null if no top answer is found
  return null;
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

function removeDuplicateLineBreaks(text) {
  return text.replace(/\n+/g, "\n");
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

  // Clean up whitespace
  text = text.replace(/\n\s*\n\s*\n/g, "\n\n"); // Max 2 line breaks
  text = text.trim();

  return text;
}

function copyToClipboard(text, button) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);

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
}

// Chrome scripting API fallback - creates isolated context
async function fetchViaScripting(url) {
  return new Promise((resolve, reject) => {
    // Check if document.body exists
    if (!document.body) {
      reject(new Error("document.body not available"));
      return;
    }

    // Create a hidden iframe to fetch the content
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.sandbox = "allow-same-origin allow-scripts";

    let timeoutId = setTimeout(() => {
      try {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      } catch (e) {
        console.log("[CodePreview] Error removing iframe:", e);
      }
      reject(new Error("Timeout"));
    }, 10000);

    iframe.onload = async () => {
      try {
        const iframeDoc =
          iframe.contentDocument || iframe.contentWindow.document;
        const html = iframeDoc.documentElement.outerHTML;

        clearTimeout(timeoutId);
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }

        // Return a Response-like object
        resolve({
          ok: true,
          status: 200,
          text: async () => html,
          clone: function () {
            return this;
          },
        });
      } catch (e) {
        clearTimeout(timeoutId);
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
        reject(e);
      }
    };

    iframe.onerror = () => {
      clearTimeout(timeoutId);
      try {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      } catch (e) {
        console.log("[CodePreview] Error removing iframe:", e);
      }
      reject(new Error("iframe load failed"));
    };

    try {
      document.body.appendChild(iframe);
    } catch (e) {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to append iframe: ${e.message}`));
      return;
    }

    try {
      iframe.src = url;
    } catch (e) {
      clearTimeout(timeoutId);
      try {
        if (iframe.parentNode) {
          document.body.removeChild(iframe);
        }
      } catch (removeError) {
        console.log("[CodePreview] Error removing iframe:", removeError);
      }
      reject(new Error(`Failed to set iframe src: ${e.message}`));
    }
  });
}

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
  const codePreviews = document.getElementsByClassName("code-preview-container");
  for (const preview of codePreviews) {
    preview.style.display = "none";
  }
}

function showCodePreviews() {
  const codePreviews = document.getElementsByClassName("code-preview-container");
  for (const preview of codePreviews) {
    preview.style.display = "block";
  }
}

// --------------------------------------------------------------------
const searchResults = document.querySelectorAll(".g");
console.log("IM HERE", searchResults);
for (const result of searchResults) {
  try {
    const linkElement = result.querySelector('a[href^="http"]');
    console.log("linkElement", linkElement.href);
    if (linkElement && isCodeURL(linkElement.href)) {
      const previewContainer = document.createElement("div");
      previewContainer.classList.add("code-preview-container");
      previewContainer.classList.add("code-snippet-container");
      // how to concatenate strings in js?
      const proxyUrl = "https://morning-cliffs-14753.herokuapp.com/";
      fetch(proxyUrl + linkElement.href)
        .then((response) => {
          return response.clone().text();
        })
        .then((html) => {
          let codeSnippet = extractTopAnswer(html);
          if (!codeSnippet) codeSnippet = extractCodeSnippetFromHTML(html);
          if (codeSnippet) {
            codeSnippet = replaceHtmlCharacters(codeSnippet);
            codeSnippet = codeSnippet.replace(/;/g, ";\n");
            codeSnippet = removeDuplicateLineBreaks(codeSnippet);
            const answerUrl = getAnswerUrl(html);
            console.log("ANSWER:", answerUrl);
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
            codeElement.appendChild(preElement);

            const button = document.createElement("button");
            button.innerText = "Copy to Clipboard";
            button.classList.add("copy-button");
            previewContainer.appendChild(button);


            previewContainer.appendChild(codeElement);

            button.addEventListener("click", () => {
              copyToClipboard(codeSnippet);
            });

            if (answerUrl) {
              const goToAnswerButton = document.createElement("btn");
              goToAnswerButton.classList.add("go-to-answer-button");
              goToAnswerButton.classList.add("text-center");
              goToAnswerButton.href = answerUrl;
              goToAnswerButton.target = "_blank";
              goToAnswerButton.textContent = "Go to Answer";
              previewContainer.appendChild(goToAnswerButton);
              goToAnswerButton.addEventListener("click", () => {
                location.href=answerUrl;
              });
            }
          } else {
            previewContainer.textContent = "Code Preview not available.";
          }
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
  ];
  const codePatterns = [
    /\/blog\//i,
    /\/tutorial\//i,
    /stackoverflow\.com/i,
    /stackexchange\.com/i,
    /docs\.microsoft\.com/i,
    /learn\.microsoft\.com/i,
    /c-sharpcorner\.com/i,
    /connectionstrings\.com/i,
    /getbootstrap\.com/i,
    /docs\.docker\.com/i,
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

  const codeMatches = html.match(codeRegex);
  if (codeMatches) {
    codeSnippet = codeMatches
      .map((match) =>
        match.replace(/<\/?code[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n")
      )
      .join("\n");
  }

  if (!codeSnippet) {
    const preMatches = html.match(preRegex);
    if (preMatches) {
      codeSnippet = preMatches
        .map((match) =>
          match.replace(/<\/?pre[^>]*>/gi, "").replace(/<br\s*\/?>/gi, "\n")
        )
        .join("\n\n");
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
        /<div\s+class="answer[^"]*">\s*<div\s+class="js-post-body"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "github.com",
      regex:
        /<div\s+class="repository-content[^"]*">\s*<div\s+class="Box-comment[^"]*">\s*<div\s+class="comment-body[^"]*">\s*([\s\S]*?)<\/div>/i,
    },
    {
      domain: "stackexchange.com",
      regex:
        /<div\s+id="answers[^"]*">\s*<div\s+class="answer[^"]*">\s*<div\s+class="js-post-body"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "webmasters.stackexchange.com",
      regex:
        /<div\s+class="answer[^"]*">\s*<div\s+class="js-post-body"[^>]*>([\s\S]*?)<\/div>/i,
    },
    {
      domain: "learn.microsoft.com",
      regex:
        /<div\s+class="row-fluid\s+answer[^"]*">\s*<div\s+class="content"[^>]*>([\s\S]*?)<\/div>/i,
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
      regex: /<div\s+class="Post-body"[^>]*>([\s\S]*?)<\/div>/i,
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

      if (matches && matches[1]) {
        topAnswer = matches[1];
        break;
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
    /https?:\/\/learn\.microsoft\.com\/.+\/\d+/
  );
  if (learnMicrosoftAnswerMatch) {
    return learnMicrosoftAnswerMatch[0];
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

function copyToClipboard(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}
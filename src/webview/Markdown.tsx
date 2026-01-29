import { useMemo } from "react";
import { marked, type MarkedExtension } from "marked";
import hljs from "highlight.js/lib/core";

// Register commonly used languages (keeps bundle smaller)
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import markdown from "highlight.js/lib/languages/markdown";
import rust from "highlight.js/lib/languages/rust";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import c from "highlight.js/lib/languages/c";
import sql from "highlight.js/lib/languages/sql";
import yaml from "highlight.js/lib/languages/yaml";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import shell from "highlight.js/lib/languages/shell";
import diff from "highlight.js/lib/languages/diff";
import plaintext from "highlight.js/lib/languages/plaintext";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("js", javascript);
hljs.registerLanguage("jsx", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("ts", typescript);
hljs.registerLanguage("tsx", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("py", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("sh", bash);
hljs.registerLanguage("zsh", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("md", markdown);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("rs", rust);
hljs.registerLanguage("go", go);
hljs.registerLanguage("java", java);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("c", c);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("yml", yaml);
hljs.registerLanguage("dockerfile", dockerfile);
hljs.registerLanguage("shell", shell);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("plaintext", plaintext);
hljs.registerLanguage("text", plaintext);

// Custom renderer that adds highlight.js to fenced code blocks
const highlightExtension: MarkedExtension = {
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : undefined;
      let highlighted: string;
      try {
        highlighted = language
          ? hljs.highlight(text, { language }).value
          : hljs.highlightAuto(text).value;
      } catch {
        highlighted = text;
      }
      const cls = language ? ` class="language-${language}"` : "";
      return `<pre><code${cls}>${highlighted}</code></pre>`;
    },
  },
};

marked.setOptions({
  breaks: true,
  gfm: true,
});

marked.use(highlightExtension);

export function Markdown({ content }: { content: string }) {
  const html = useMemo(() => {
    if (!content) return "";
    return marked.parse(content, { async: false }) as string;
  }, [content]);

  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

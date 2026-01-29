import { useState } from "react";

const TRUNCATE_LINES = 20;

interface ToolCallProps {
  toolCall: {
    toolCallId: string;
    toolName: string;
    args: any;
    result?: any;
    isError?: boolean;
    done: boolean;
  };
}

export function ToolCall({ toolCall }: ToolCallProps) {
  const label = formatToolLabel(toolCall.toolName, toolCall.args);

  const statusCls = toolCall.done
    ? toolCall.isError
      ? "tc-status error"
      : "tc-status success"
    : "tc-status running";

  const bgCls = toolCall.done
    ? toolCall.isError
      ? "tc tc-error-bg"
      : "tc tc-success-bg"
    : "tc";

  return (
    <div className={bgCls}>
      <div className="tc-header">
        <span className="tc-name">{toolCall.toolName}</span>
        <span className="tc-label">{label}</span>
        <span className={statusCls}>
          {toolCall.done ? (toolCall.isError ? "✕" : "✓") : <span className="tc-spinner" />}
        </span>
      </div>
      {toolCall.result != null && (
        <div className="tc-body">
          <ToolBody
            toolName={toolCall.toolName}
            args={toolCall.args}
            result={toolCall.result}
            isError={toolCall.isError}
          />
        </div>
      )}
    </div>
  );
}

// ── Per-tool body rendering ──

function ToolBody({
  toolName,
  args,
  result,
  isError,
}: {
  toolName: string;
  args: any;
  result: any;
  isError?: boolean;
}) {
  switch (toolName) {
    case "read":
      return <ReadBody args={args} result={result} isError={isError} />;
    case "write":
      return <WriteBody args={args} result={result} isError={isError} />;
    case "edit":
      return <EditBody args={args} result={result} isError={isError} />;
    case "bash":
      return <BashBody args={args} result={result} isError={isError} />;
    case "grep":
    case "find":
    case "ls":
      return <GenericTextBody args={args} result={result} isError={isError} />;
    default:
      return <FallbackBody args={args} result={result} />;
  }
}

function ReadBody({
  args,
  result,
  isError,
}: {
  args: any;
  result: any;
  isError?: boolean;
}) {
  const text = extractContentText(result);
  const images = extractContentImages(result);
  return (
    <>
      {isError && text && <div className="tc-error">{text}</div>}
      {!isError && text && <TruncatedBlock content={text} />}
      {!isError &&
        images.map((img, i) => (
          <img
            key={i}
            src={`data:${img.mimeType};base64,${img.data}`}
            className="tc-image"
          />
        ))}
    </>
  );
}

function WriteBody({
  args,
  result,
  isError,
}: {
  args: any;
  result: any;
  isError?: boolean;
}) {
  const text = extractContentText(result);
  const written = args?.content;
  return (
    <>
      {written && <TruncatedBlock content={written} />}
      {text && (
        <div className={isError ? "tc-error" : "tc-result-msg"}>{text}</div>
      )}
    </>
  );
}

function EditBody({
  args,
  result,
  isError,
}: {
  args: any;
  result: any;
  isError?: boolean;
}) {
  const text = extractContentText(result);
  const diff = result?.details?.diff;

  if (isError && text) {
    return <div className="tc-error">{text}</div>;
  }

  if (diff) {
    return <DiffBlock diff={diff} />;
  }

  return (
    <>
      {args?.old_string && (
        <pre className="tc-pre tc-diff-old">
          <code>{args.old_string}</code>
        </pre>
      )}
      {args?.new_string && (
        <pre className="tc-pre tc-diff-new">
          <code>{args.new_string}</code>
        </pre>
      )}
      {text && <div className="tc-result-msg">{text}</div>}
    </>
  );
}

function BashBody({
  args,
  result,
  isError,
}: {
  args: any;
  result: any;
  isError?: boolean;
}) {
  const text = extractContentText(result);
  // Command is already shown in the header label — only show output
  return (
    <>
      {text && (
        <TruncatedBlock
          content={text}
          className={isError ? "tc-error-block" : undefined}
        />
      )}
    </>
  );
}

function GenericTextBody({
  args,
  result,
  isError,
}: {
  args: any;
  result: any;
  isError?: boolean;
}) {
  const text = extractContentText(result);
  return (
    <>
      {renderGenericArgs(args)}
      {text && (
        <TruncatedBlock
          content={text}
          className={isError ? "tc-error-block" : undefined}
        />
      )}
    </>
  );
}

function FallbackBody({ args, result }: { args: any; result: any }) {
  const text = extractContentText(result);
  return (
    <>
      <pre className="tc-pre">
        <code>{JSON.stringify(args, null, 2)}</code>
      </pre>
      {text && <TruncatedBlock content={text} />}
    </>
  );
}

// ── Shared components ──

function TruncatedBlock({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const lines = content.split("\n");
  const needsTruncation = lines.length > TRUNCATE_LINES;
  const display = showAll
    ? content
    : lines.slice(0, TRUNCATE_LINES).join("\n");

  return (
    <div className={className}>
      <pre className="tc-pre">
        <code>{display}</code>
      </pre>
      {needsTruncation && (
        <button
          className="tc-expand-btn"
          onClick={() => setShowAll(!showAll)}
        >
          {showAll ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

function DiffBlock({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre className="tc-pre tc-diff-block">
      <code>
        {lines.map((line, i) => {
          let cls = "diff-ctx";
          if (line.startsWith("+") && !line.startsWith("+++")) cls = "diff-add";
          else if (line.startsWith("-") && !line.startsWith("---"))
            cls = "diff-del";
          else if (line.startsWith("@@")) cls = "diff-hunk";
          return (
            <span key={i} className={cls}>
              {line}
              {"\n"}
            </span>
          );
        })}
      </code>
    </pre>
  );
}

// ── Helpers ──

function extractContentImages(
  result: any,
): { data: string; mimeType: string }[] {
  const arr = Array.isArray(result)
    ? result
    : Array.isArray(result?.content)
      ? result.content
      : null;
  if (!arr) return [];
  return arr.filter((b: any) => b.type === "image" && b.data && b.mimeType);
}

function extractContentText(result: any): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  const arr = Array.isArray(result)
    ? result
    : Array.isArray(result?.content)
      ? result.content
      : null;
  if (arr) {
    return arr
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text ?? "")
      .join("");
  }
  return "";
}

function renderGenericArgs(args: any) {
  if (!args) return null;
  const entries = Object.entries(args).filter(
    ([_, v]) => v != null && typeof v !== "object",
  );
  if (entries.length === 0) return null;
  return (
    <div className="tc-input-summary">
      {entries.map(([k, v]) => (
        <div key={k} className="tc-kv">
          <span className="tc-input-label">{k}</span>
          <code className="tc-input-value">{String(v)}</code>
        </div>
      ))}
    </div>
  );
}

function formatToolLabel(name: string, args: any): string {
  if (!args) return "";
  switch (name) {
    case "read":
    case "write":
    case "edit":
      return shortenPath(args.path);
    case "bash":
      return truncateStr(String(args.command ?? ""), 80);
    case "grep":
      return `${args.pattern ?? ""} ${args.path ? "in " + shortenPath(args.path) : ""}`.trim();
    case "find":
      return `${args.pattern ?? ""} ${args.path ? "in " + shortenPath(args.path) : ""}`.trim();
    case "ls":
      return shortenPath(args.path);
    default:
      return "";
  }
}

function shortenPath(p: string | undefined): string {
  if (!p) return "";
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return "…/" + parts.slice(-2).join("/");
}

function truncateStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + "…";
}

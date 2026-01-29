import React, { useState } from "react";

const TRUNCATE_LINES = 10;

interface ToolCallProps {
  toolCall: {
    toolCallId: string;
    toolName: string;
    args: any;
    result?: any;
    details?: any;
    isError?: boolean;
    done: boolean;
  };
  showBody?: boolean;
}

export function ToolCall({ toolCall, showBody = true }: ToolCallProps) {
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

  // console.log({ toolCall });

  return (
    <div className={bgCls}>
      <div className="tc-header">
        <ToolHeader toolName={toolCall.toolName} args={toolCall.args} />
        <span className={statusCls}>
          {toolCall.done ? (toolCall.isError ? "✕" : "✓") : <span className="tc-spinner" />}
        </span>
      </div>
      {showBody && (
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

// ── Per-tool header rendering ──

function ToolHeader({ toolName, args }: { toolName: string; args: any }) {
  switch (toolName) {
    case "read": {
      const range =
        args?.limit != null || args?.offset != null
          ? ` ${args.offset ?? 1}:${(args.offset ?? 1) + (args.limit ?? 0)}`
          : "";
      return (
        <>
          <span className="tc-name">read</span>
          <span className="tc-label">{shortenPath(args?.path)}</span>
          <span className="tc-range">{range}</span>
        </>
      );
    }
    case "write":
      return (
        <>
          <span className="tc-name">write</span>
          <span className="tc-label">{shortenPath(args?.path)}</span>
        </>
      );
    case "edit":
      return (
        <>
          <span className="tc-name">edit</span>
          <span className="tc-label">{shortenPath(args?.path)}</span>
        </>
      );
    case "bash":
      return (
        <>
          <span className="tc-name">bash</span>
          <span className="tc-label tc-bash-label">{args?.command ?? ""}</span>
        </>
      );
    case "grep":
      return (
        <>
          <span className="tc-name">grep</span>
          <span className="tc-label">
            {args?.pattern ?? ""}{args?.path ? " in " + shortenPath(args.path) : ""}
          </span>
        </>
      );
    case "find":
      return (
        <>
          <span className="tc-name">find</span>
          <span className="tc-label">
            {args?.pattern ?? ""}{args?.path ? " in " + shortenPath(args.path) : ""}
          </span>
        </>
      );
    case "ls":
      return (
        <>
          <span className="tc-name">ls</span>
          <span className="tc-label">{shortenPath(args?.path)}</span>
        </>
      );
    default:
      return (
        <>
          <span className="tc-name">{toolName}</span>
          <span className="tc-label">{formatFallbackLabel(args)}</span>
        </>
      );
  }
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

  if (isError && text) {
    return <div className="tc-error">{text}</div>;
  }

  // Always show old/new from args with red/green styling
  const hasArgs = args?.oldText || args?.newText;

  return (
    <>
      {hasArgs && (
        <>
          {args.oldText && (
            <pre className="tc-pre tc-diff-old">
              <code>{args.oldText}</code>
            </pre>
          )}
          {args.newText && (
            <pre className="tc-pre tc-diff-new">
              <code>{args.newText}</code>
            </pre>
          )}
        </>
      )}
      {text && !hasArgs && <div className="tc-result-msg">{text}</div>}
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

function formatFallbackLabel(args: any): string {
  if (!args) return "";
  const entries = Object.entries(args).filter(
    ([_, v]) => v != null && typeof v === "string",
  );
  if (entries.length === 0) return "";
  return entries
    .slice(0, 2)
    .map(([_, v]) => truncateStr(String(v), 40))
    .join(" ");
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

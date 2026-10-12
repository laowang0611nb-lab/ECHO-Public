import type { ReactNode } from "react";

function inlineNodes(value: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) nodes.push(value.slice(cursor, match.index));
    const token = match[0];
    key += 1;
    if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code className="rounded bg-muted px-1 py-0.5 text-[0.9em]" key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\([^)]+\)$/);
      nodes.push(<span key={key}>{link?.[1] ?? token}</span>);
    }
    cursor = match.index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function paragraph(lines: string[], key: number) {
  return (
    <p className="whitespace-pre-wrap leading-6" key={key}>
      {lines.map((line, index) => (
        <span key={index}>
          {index > 0 ? <br /> : null}
          {inlineNodes(line)}
        </span>
      ))}
    </p>
  );
}

export function SafeMarkdown({ content }: { content: string }) {
  const blocks = content.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const rendered: ReactNode[] = [];

  blocks.forEach((rawBlock, blockIndex) => {
    const block = rawBlock.trim();
    if (!block) return;

    if (block.startsWith("```") && block.endsWith("```")) {
      const code = block.split("\n").slice(1, -1).join("\n");
      rendered.push(<pre className="overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs text-slate-100" key={blockIndex}><code>{code}</code></pre>);
      return;
    }

    const lines = block.split("\n");
    if (/^#{1,3}\s/.test(lines[0])) {
      const level = lines[0].match(/^#+/)?.[0].length ?? 1;
      const text = lines[0].replace(/^#{1,3}\s+/, "");
      rendered.push(level === 1
        ? <h2 className="text-base font-semibold" key={blockIndex}>{inlineNodes(text)}</h2>
        : <h3 className="text-sm font-semibold" key={blockIndex}>{inlineNodes(text)}</h3>);
      return;
    }

    if (lines.every((line) => /^[-*]\s+/.test(line))) {
      rendered.push(
        <ul className="list-disc space-y-1 pl-5" key={blockIndex}>
          {lines.map((line, index) => <li key={index}>{inlineNodes(line.replace(/^[-*]\s+/, ""))}</li>)}
        </ul>,
      );
      return;
    }

    if (lines.every((line) => /^\d+\.\s+/.test(line))) {
      rendered.push(
        <ol className="list-decimal space-y-1 pl-5" key={blockIndex}>
          {lines.map((line, index) => <li key={index}>{inlineNodes(line.replace(/^\d+\.\s+/, ""))}</li>)}
        </ol>,
      );
      return;
    }

    if (lines.every((line) => line.startsWith(">"))) {
      rendered.push(
        <blockquote className="border-l-2 border-primary/35 pl-3 text-muted-foreground" key={blockIndex}>
          {inlineNodes(lines.map((line) => line.replace(/^>\s?/, "")).join(" "))}
        </blockquote>,
      );
      return;
    }

    rendered.push(paragraph(lines, blockIndex));
  });

  return <div className="space-y-2 text-sm">{rendered}</div>;
}

import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A small markdown renderer for the copilot's answers and drafts. It builds React elements
 * and never sets HTML, so text from a model (or a notice it quoted) cannot inject markup;
 * raw HTML shows as text. Links are kept only for http(s), mailto and in-app paths.
 *
 * Covers what Claude writes in a bid document: headings, paragraphs, bullet, numbered and
 * task lists (nested by indent), pipe tables, block quotes, fenced code, and inline bold,
 * italic, strikethrough, code and links. `[placeholder]`s are tinted so gaps stand out, and
 * GeBIZ document numbers link to their tender page.
 */

type ListItem = { text: string; checked: boolean | null; children: MdBlock[] };
type MdBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "code"; text: string }
  | { type: "quote"; children: MdBlock[] }
  | { type: "list"; ordered: boolean; start: number; items: ListItem[] }
  | { type: "table"; head: string[]; align: ("left" | "center" | "right")[]; rows: string[][] }
  | { type: "rule" };

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const FENCE = /^ {0,3}(```|~~~)/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?/;
const LIST = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.match(/^\s*/)![0].replace(/\t/g, "    ").length;

function cells(line: string): string[] {
  let text = line.trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  return text.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-");
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i];
  return HEADING.test(line) || FENCE.test(line) || RULE.test(line) || QUOTE.test(line) || LIST.test(line) || isTableStart(lines, i);
}

function parseList(lines: string[], start: number): [MdBlock, number] {
  const first = LIST.exec(lines[start])!;
  const baseIndent = indentOf(first[1]);
  const ordered = /\d/.test(first[2]);
  const items: { text: string; sub: string[] }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const m = LIST.exec(line);
    if (m && indentOf(m[1]) === baseIndent && /\d/.test(m[2]) === ordered) {
      items.push({ text: m[3], sub: [] });
      i++;
      continue;
    }
    const current = items[items.length - 1];
    if (!line.trim()) {
      // A blank line continues the list only if more of it follows.
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = lines[j];
      if (next === undefined) break;
      const nm = LIST.exec(next);
      if (indentOf(next) > baseIndent || (nm && indentOf(nm[1]) === baseIndent && /\d/.test(nm[2]) === ordered)) {
        current.sub.push("");
        i++;
        continue;
      }
      break;
    }
    if (indentOf(line) > baseIndent) {
      current.sub.push(line.replace(new RegExp(`^\\s{0,${baseIndent + 4}}`), ""));
      i++;
      continue;
    }
    if (!m && !startsBlock(lines, i) && current.sub.length === 0) {
      current.text += ` ${line.trim()}`; // a lazy continuation line
      i++;
      continue;
    }
    break;
  }
  return [
    {
      type: "list",
      ordered,
      start: ordered ? Number.parseInt(first[2], 10) || 1 : 1,
      items: items.map(({ text, sub }) => {
        const task = /^\[([ xX])\]\s+/.exec(text);
        return {
          text: task ? text.slice(task[0].length) : text,
          checked: task ? task[1].toLowerCase() === "x" : null,
          children: parseBlocks(sub),
        };
      }),
    },
    i,
  ];
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = FENCE.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // the closing fence (absent while a stream is still arriving)
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() && QUOTE.test(lines[i])) body.push(lines[i++].replace(QUOTE, ""));
      blocks.push({ type: "quote", children: parseBlocks(body) });
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map((c) => (c.startsWith(":") && c.endsWith(":") ? "center" : c.endsWith(":") ? "right" : "left"));
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) rows.push(cells(lines[i++]));
      blocks.push({ type: "table", head, align, rows });
      continue;
    }
    if (LIST.test(line)) {
      const [list, next] = parseList(lines, i);
      blocks.push(list);
      i = next;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines, i))) para.push(lines[i++].trim());
    blocks.push({ type: "paragraph", text: para.join("\n") });
  }
  return blocks;
}

// ---------------------------------------------------------------- inline

const SAFE_URL = /^(https?:\/\/|mailto:|\/(?!\/))/i;

const INLINE = new RegExp(
  [
    /`([^`\n]+)`/.source, // 1 code
    /\*\*(?=\S)([^\n]*?\S)\*\*/.source, // 2 bold
    /__(?=\S)([^\n]*?\S)__/.source, // 3 bold
    /~~(?=\S)([^\n]*?\S)~~/.source, // 4 strikethrough
    /\[([^\]\n]+)\]\(([^)\s]+)\)/.source, // 5, 6 link
    /(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/.source, // 7 bare URL
    /(?<![\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/.source, // 8 italic
    /(?<![\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/.source, // 9 italic
    /\[([^\]\n]{2,120})\](?!\()/.source, // 10 placeholder
    /\b([A-Z0-9]{6}ET[A-Z]\d{8})\b/.source, // 11 GeBIZ document number
  ].join("|"),
  "g",
);

function ExternalOrInternal({ href, children }: { href: string; children: ReactNode }) {
  const className = "font-book text-kopi underline-offset-4 hover:underline";
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function inline(text: string, linkDocs: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    last = at + m[0].length;
    const key = n++;
    if (m[1] !== undefined) {
      out.push(
        <code key={key} className="rounded-md bg-muted px-1.5 py-px font-sans text-[0.93em]">
          {m[1]}
        </code>,
      );
    } else if (m[2] !== undefined || m[3] !== undefined) {
      out.push(
        <strong key={key} className="font-medium">
          {inline(m[2] ?? m[3], linkDocs)}
        </strong>,
      );
    } else if (m[4] !== undefined) {
      out.push(<s key={key}>{inline(m[4], linkDocs)}</s>);
    } else if (m[5] !== undefined) {
      const href = m[6];
      out.push(
        SAFE_URL.test(href) ? (
          <ExternalOrInternal key={key} href={href}>
            {inline(m[5], false)}
          </ExternalOrInternal>
        ) : (
          <Fragment key={key}>{m[5]}</Fragment>
        ),
      );
    } else if (m[7] !== undefined) {
      out.push(
        <ExternalOrInternal key={key} href={m[7]}>
          <span className="break-all">{m[7]}</span>
        </ExternalOrInternal>,
      );
    } else if (m[8] !== undefined || m[9] !== undefined) {
      out.push(<em key={key}>{inline(m[8] ?? m[9], linkDocs)}</em>);
    } else if (m[10] !== undefined) {
      out.push(
        <span key={key} className="rounded-md bg-kopi-soft px-1.5 py-0.5 text-[0.95em] text-kopi" title="To fill in">
          [{m[10]}]
        </span>,
      );
    } else if (m[11] !== undefined) {
      out.push(
        linkDocs ? (
          <ExternalOrInternal key={key} href={`/tender/?doc=${m[11]}`}>
            {m[11]}
          </ExternalOrInternal>
        ) : (
          <Fragment key={key}>{m[11]}</Fragment>
        ),
      );
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// ---------------------------------------------------------------- blocks

const HEADING_CLASS: Record<number, string> = {
  1: "text-[19px] font-medium tracking-[-0.02em]",
  2: "text-base font-medium tracking-[-0.01em] pt-2 first:pt-0",
  3: "text-[15px] font-medium pt-1 first:pt-0",
};

function Blocks({ blocks, linkDocs }: { blocks: MdBlock[]; linkDocs: boolean }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading": {
            const Tag = `h${Math.min(block.level + 1, 6)}` as "h2";
            return (
              <Tag key={i} className={HEADING_CLASS[block.level] ?? "text-sm font-medium"}>
                {inline(block.text, linkDocs)}
              </Tag>
            );
          }
          case "paragraph":
            // A single newline is a line break, as in a chat, so "To:" and "From:" lines stay on their own lines.
            return (
              <p key={i}>
                {block.text.split("\n").map((line, j) => (
                  <Fragment key={j}>
                    {j > 0 && <br />}
                    {inline(line.replace(/\\$/, ""), linkDocs)}
                  </Fragment>
                ))}
              </p>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-xl bg-muted/70 px-4 py-3 font-mono text-[12.5px] leading-relaxed">
                {block.text}
              </pre>
            );
          case "quote":
            return (
              <blockquote key={i} className="flex flex-col gap-2 border-l-2 pl-3.5 text-muted-foreground">
                <Blocks blocks={block.children} linkDocs={linkDocs} />
              </blockquote>
            );
          case "rule":
            return <hr key={i} className="my-1 border-border" />;
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            const tasks = block.items.every((item) => item.checked !== null);
            return (
              <Tag
                key={i}
                start={block.ordered && block.start !== 1 ? block.start : undefined}
                className={cn(
                  "flex flex-col gap-1.5",
                  tasks ? "pl-0" : "pl-5",
                  !tasks && (block.ordered ? "list-decimal marker:text-muted-foreground" : "list-disc marker:text-muted-foreground/70"),
                )}
              >
                {block.items.map((item, j) => (
                  <li key={j} className={cn("pl-1", tasks && "flex list-none gap-2.5 pl-0")}>
                    {item.checked !== null && (
                      <span
                        aria-label={item.checked ? "Done" : "To do"}
                        className={cn(
                          "mt-[0.25em] grid size-4 shrink-0 place-items-center rounded-[5px] border text-[10px]",
                          item.checked ? "border-kopi bg-kopi text-white" : "border-foreground/25 bg-card",
                        )}
                      >
                        {item.checked ? "✓" : ""}
                      </span>
                    )}
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <span>{inline(item.text, linkDocs)}</span>
                      {item.children.length > 0 && <Blocks blocks={item.children} linkDocs={linkDocs} />}
                    </div>
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={i} className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[32rem] border-collapse text-left text-[13px] leading-normal">
                  <thead>
                    <tr>
                      {block.head.map((cell, c) => (
                        <th
                          key={c}
                          className="border-b border-border/70 bg-muted/50 px-3 py-2 align-bottom text-xs font-book text-muted-foreground"
                          style={{ textAlign: block.align[c] ?? "left" }}
                        >
                          {inline(cell, linkDocs)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-border/70 last:border-b-0">
                        {block.head.map((_, c) => (
                          <td key={c} className="px-3 py-2 align-top" style={{ textAlign: block.align[c] ?? "left" }}>
                            {inline(row[c] ?? "", linkDocs)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </>
  );
}

export function Markdown({ text, className, linkDocs = true }: { text: string; className?: string; linkDocs?: boolean }) {
  const blocks = parseBlocks(text.replace(/\r\n?/g, "\n").split("\n"));
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 leading-relaxed break-words", className)}>
      <Blocks blocks={blocks} linkDocs={linkDocs} />
    </div>
  );
}

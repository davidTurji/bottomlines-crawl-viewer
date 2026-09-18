import { Fragment, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The small Markdown subset the Ask AI answers are written in.
 *
 * The thread used to render answers in a <pre>, so every answer arrived with
 * its asterisks showing: "**3,617 lines came off this week**" as literal
 * text, tables as a column of pipes. The answers are the one place on the
 * report where prose does the explaining, and prose full of punctuation
 * nobody typed reads as broken.
 *
 * Deliberately not a Markdown library. The input is not arbitrary: it is
 * written by the same codebase that renders it, so the grammar is known and
 * small -- paragraphs, bold, italics, inline code, bullet and numbered
 * lists, and the pipe tables the SSP answers use. A hundred lines that
 * handle exactly that, with no HTML passthrough anywhere, beats a parser
 * whose job is to be safe with input we never receive.
 *
 * Everything below builds React elements. There is no dangerouslySetInnerHTML
 * in this file, and there must never be one: the day an answer carries text
 * a reader supplied, that is the line between formatting and injection.
 */

/** Inline spans: **bold**, *italic*, `code`. Applied in one pass so a bold
 *  run containing a number keeps its formatting rather than the first
 *  matcher eating the string. */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  // One alternation, so the scanner never has to decide which of three
  // passes should have won on overlapping markers.
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (tok.startsWith("**")) {
      out.push(
        <strong key={key} className="font-semibold text-slate-900">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else if (tok.startsWith("`")) {
      out.push(
        <code
          key={key}
          className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.92em] text-slate-700"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(
        <em key={key} className="italic">
          {tok.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** `| a | b |` into its cells, dropping the leading and trailing pipes. */
function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
/** The |---|---| line under a table's header. */
const isTableRule = (l: string) => /^\s*\|[\s:|-]+\|\s*$/.test(l);

export function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank lines only separate blocks; the spacing is the container's job.
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Table: a run of pipe rows, with the rule line under the header.
    if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const header = cells(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        body.push(cells(lines[i]));
        i += 1;
      }
      blocks.push(
        // Its own scroll container: a table is the one block allowed to be
        // wider than the thread, and the thread must not scroll sideways
        // because of it.
        <div key={`b${key++}`} className="-mx-1 overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {header.map((h, c) => (
                  <th
                    key={c}
                    className="border-b border-border px-2 py-1.5 text-left font-medium text-slate-500"
                  >
                    {inline(h, `h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, r) => (
                <tr key={r} className="border-b border-border/60 last:border-0">
                  {row.map((c, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "px-2 py-1.5 align-top text-slate-700",
                        ci > 0 && "tabular-nums",
                      )}
                    >
                      {inline(c, `r${r}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Bullet list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i += 1;
      }
      blocks.push(
        <ul key={`b${key++}`} className="space-y-1.5 pl-1">
          {items.map((it, n) => (
            <li key={n} className="flex gap-2">
              <span aria-hidden className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-slate-400" />
              <span>{inline(it, `u${key}-${n}`)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Numbered list. The rendered number is the one the author wrote, so a
    // list that starts at 3 still reads as 3.
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: { n: string; text: string }[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const [, n, rest] = lines[i].match(/^\s*(\d+)\.\s+(.*)$/)!;
        items.push({ n, text: rest });
        i += 1;
      }
      blocks.push(
        <ol key={`b${key++}`} className="space-y-1.5 pl-1">
          {items.map((it, n) => (
            <li key={n} className="flex gap-2">
              <span className="min-w-[1.1rem] flex-shrink-0 font-medium tabular-nums text-slate-400">
                {it.n}.
              </span>
              <span>{inline(it.text, `o${key}-${n}`)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    /*
     * Paragraph: consecutive non-blank lines that start no other block.
     *
     * THE FIRST LINE IS TAKEN UNCONDITIONALLY, and that is load-bearing.
     * The loop below skips table rows, so a lone `| a | b |` -- a table
     * header whose |---| separator has not arrived yet, which is every
     * table for the few frames it is streaming in -- matched no branch at
     * all and collected nothing, leaving `i` where it was. The outer while
     * then read the same line again, forever, and took the tab down with
     * it. Consuming the line here means every path through this loop
     * advances, whatever the line turns out to be.
     */
    const para: string[] = [lines[i]];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !isTableRow(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`b${key++}`}>
        {para.map((l, n) => (
          <Fragment key={n}>
            {n > 0 && <br />}
            {inline(l, `p${key}-${n}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return <div className={cn("space-y-3 leading-relaxed", className)}>{blocks}</div>;
}

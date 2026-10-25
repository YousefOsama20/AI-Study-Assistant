import { Fragment, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface MarkdownProps {
  content: string
  className?: string
}

const INLINE_PATTERN =
  /(\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*)/g

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(INLINE_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index))
    }

    const [, outer, linkText, href, code, bold, italic] = match
    if (linkText && href) {
      nodes.push(
        <a
          key={`inline-${key++}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-primary-text underline underline-offset-2 hover:opacity-80"
        >
          {renderInline(linkText)}
        </a>,
      )
    } else if (code !== undefined) {
      nodes.push(
        <code
          key={`inline-${key++}`}
          className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-fg"
        >
          {code}
        </code>,
      )
    } else if (bold !== undefined) {
      nodes.push(
        <strong key={`inline-${key++}`} className="font-semibold text-fg">
          {renderInline(bold)}
        </strong>,
      )
    } else if (italic !== undefined) {
      nodes.push(
        <em key={`inline-${key++}`}>{renderInline(italic)}</em>,
      )
    } else {
      nodes.push(outer)
    }

    lastIndex = index + outer.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function parseTableRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function isBlockStart(line: string): boolean {
  return (
    /^(#{1,6})\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-*+]\s+/.test(line) ||
    /^\d+[.)]\s+/.test(line) ||
    /^(\*\*\*|---|___)\s*$/.test(line) ||
    /^\|.*\|/.test(line)
  )
}

const headingClasses: Record<number, string> = {
  1: 'text-lg font-semibold text-fg',
  2: 'text-base font-semibold text-fg',
  3: 'text-sm font-semibold text-fg',
  4: 'text-sm font-semibold text-fg',
  5: 'text-sm font-semibold text-fg',
  6: 'text-sm font-semibold text-fg',
}

export function Markdown({ content, className }: MarkdownProps) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]

    if (line.trim() === '') {
      index += 1
      continue
    }

    const fence = line.match(/^```(\w+)?\s*$/)
    if (fence) {
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(
        <pre
          key={`block-${key++}`}
          className="overflow-x-auto rounded-md border border-border bg-surface-2 p-3 text-xs"
        >
          <code className="font-mono">{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(6, heading[1].length)
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
      blocks.push(
        <Tag key={`block-${key++}`} className={headingClasses[level]}>
          {renderInline(heading[2])}
        </Tag>,
      )
      index += 1
      continue
    }

    if (/^(\*\*\*|---|___)\s*$/.test(line)) {
      blocks.push(
        <hr key={`block-${key++}`} className="border-border" />,
      )
      index += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''))
        index += 1
      }
      blocks.push(
        <blockquote
          key={`block-${key++}`}
          className="border-s-2 border-primary/40 ps-3 text-muted"
        >
          {quoteLines.map((quoteLine, quoteIndex) => (
            <p key={quoteIndex}>{renderInline(quoteLine)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*+]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ul key={`block-${key++}`} className="ms-5 list-disc space-y-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\d+[.)]\s+/, ''))
        index += 1
      }
      blocks.push(
        <ol key={`block-${key++}`} className="ms-5 list-decimal space-y-1">
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ol>,
      )
      continue
    }

    if (line.trim().startsWith('|')) {
      const nextLine = lines[index + 1] ?? ''
      if (/^\s*\|?\s*:?-{3,}/.test(nextLine)) {
        const header = parseTableRow(line)
        index += 2
        const rows: string[][] = []
        while (index < lines.length && lines[index].trim().startsWith('|')) {
          rows.push(parseTableRow(lines[index]))
          index += 1
        }
        blocks.push(
          <div
            key={`block-${key++}`}
            className="overflow-x-auto rounded-md border border-border"
          >
            <table className="w-full border-collapse text-start text-xs">
              <thead className="bg-surface-2">
                <tr>
                  {header.map((cell, cellIndex) => (
                    <th
                      key={cellIndex}
                      className="border-b border-border px-3 py-2 text-start font-semibold text-fg"
                    >
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border last:border-0">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="px-3 py-2 align-top">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
    }

    const paragraphLines: string[] = [line]
    index += 1
    while (
      index < lines.length &&
      lines[index].trim() !== '' &&
      !isBlockStart(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(
      <p key={`block-${key++}`}>{renderInline(paragraphLines.join(' '))}</p>,
    )
  }

  return (
    <div className={cn('space-y-2 text-sm leading-relaxed text-fg', className)}>
      {blocks.map((block, blockIndex) => (
        <Fragment key={blockIndex}>{block}</Fragment>
      ))}
    </div>
  )
}

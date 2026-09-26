import { Fragment, type ReactNode } from 'react';

/**
 * A translated text with emphasis or an inline symbol: `<b>…</b>` becomes
 * `bold(chunk)`, `{name}` becomes `slots[name]`. The only markup texts may
 * carry (docs/i18n.md); the check makes translations keep the same tags.
 *
 *   rich(t('install.ios.share'), (chunk) => <strong>{chunk}</strong>, { icon: <ShareIcon /> })
 */
export function rich(text: string, bold: (chunk: string) => ReactNode, slots: Record<string, ReactNode> = {}): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let index = 0;
  for (const match of text.matchAll(/<b>(.*?)<\/b>|\{(\w+)\}/g)) {
    if (match.index! > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) parts.push(<Fragment key={index}>{bold(match[1])}</Fragment>);
    else parts.push(<Fragment key={index}>{slots[match[2]] ?? match[0]}</Fragment>);
    index += 1;
    last = match.index! + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

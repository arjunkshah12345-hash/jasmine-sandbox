import type { ReactNode } from "react";

/** Renders the small inline markdown used in guide and compare content: `code`, [text](href), **bold**. */
export function Md({ children }: { children: string }) {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g;
  let last = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(children))) {
    if (m.index > last) out.push(children.slice(last, m.index));
    const t = m[0];
    if (t.startsWith("`")) out.push(<code key={k++}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("**")) out.push(<strong key={k++}>{t.slice(2, -2)}</strong>);
    else {
      const [, text, href] = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      out.push(<a key={k++} href={href}>{text}</a>);
    }
    last = m.index + t.length;
  }
  if (last < children.length) out.push(children.slice(last));
  return <>{out}</>;
}

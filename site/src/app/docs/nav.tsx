"use client";

import { usePathname } from "next/navigation";

export const DOCS: { group: string; pages: [string, string][] }[] = [
  { group: "Start", pages: [["Introduction", "/docs"], ["Agent setup prompt", "/docs/agents"], ["Concepts", "/docs/concepts"]] },
  { group: "Build", pages: [["SDKs", "/docs/sdk"], ["HTTP API", "/docs/api"], ["Browser sandboxes", "/docs/browser"], ["S3 mounts", "/docs/storage"]] },
  { group: "Learn", pages: [["Guides", "/guides"], ["Compare providers", "/compare"]] },
  { group: "Run", pages: [["Jasmine Cloud", "/docs/cloud"], ["Self-hosting", "/docs/self-hosting"]] },
];

export function DocsNav() {
  const path = usePathname().replace(/\/$/, "") || "/docs";
  return (
    <nav aria-label="Docs" className="space-y-7 text-sm">
      {DOCS.map((g) => (
        <div key={g.group}>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-600">{g.group}</p>
          <ul className="mt-3 space-y-1 border-l border-white/[0.07]">
            {g.pages.map(([t, h]) => {
              const on = path === h;
              return (
                <li key={h}>
                  <a
                    href={h}
                    aria-current={on ? "page" : undefined}
                    className={`-ml-px block border-l py-1 pl-4 transition ${on ? "border-[var(--leaf)] text-white" : "border-transparent text-zinc-400 hover:border-white/30 hover:text-zinc-200"}`}
                  >
                    {t}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

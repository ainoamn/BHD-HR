"use client";

import type { PrefetchKind } from "next/dist/client/components/router-reducer/router-reducer-types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const FULL = { kind: "full" as PrefetchKind };
/** Route handlers and print sheets: never prefetch them as pages. */
const SKIP = /^\/(api|files)\/|^\/reports\/export|\/(print|statement)$|^\/salaries\/sheet/;

function pageHref(target: EventTarget | null) {
  const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return null;
  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin || SKIP.test(url.pathname)) return null;
  return `${url.pathname}${url.search}`;
}

/**
 * Keeps navigation instant: warms every section the user can open, prefetches any in-app link
 * on hover/touch, and shows a slim progress bar only when a page is not ready yet. Fresh data comes
 * from LiveUpdates when something changes, never from the tab regaining focus (BHD-SESSION-POLICY).
 */
export function NavSpeed({ sections }: { sections: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [bar, setBar] = useState({ visible: false, width: 0 });
  const timers = useRef<{ show?: number; trickle?: number; hide?: number; safety?: number }>({});
  const finishRef = useRef(() => {});
  const visible = useRef(false);
  const sectionsKey = sections.join("|");

  useEffect(() => {
    const run = () => sectionsKey.split("|").forEach((href) => router.prefetch(href, FULL));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(run, { timeout: 1200 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(run, 300);
    return () => clearTimeout(id);
  }, [router, sectionsKey, pathname, query]);

  useEffect(() => {
    const recent = new Map<string, number>();
    const warm = (event: Event) => {
      const href = pageHref(event.target);
      if (!href || href === `${window.location.pathname}${window.location.search}` || Date.now() - (recent.get(href) ?? 0) < 15_000) return;
      recent.set(href, Date.now());
      router.prefetch(href, FULL);
    };
    document.addEventListener("pointerover", warm, { passive: true });
    document.addEventListener("touchstart", warm, { passive: true });
    document.addEventListener("focusin", warm);
    return () => {
      document.removeEventListener("pointerover", warm);
      document.removeEventListener("touchstart", warm);
      document.removeEventListener("focusin", warm);
    };
  }, [router]);

  useEffect(() => {
    const t = timers.current;
    const clear = () => {
      window.clearTimeout(t.show);
      window.clearInterval(t.trickle);
      window.clearTimeout(t.hide);
      window.clearTimeout(t.safety);
    };
    const finish = () => {
      clear();
      if (!visible.current) return;
      setBar({ visible: true, width: 1 });
      t.hide = window.setTimeout(() => {
        visible.current = false;
        setBar({ visible: false, width: 0 });
      }, 220);
    };
    const start = () => {
      clear();
      t.show = window.setTimeout(() => {
        visible.current = true;
        setBar({ visible: true, width: 0.25 });
        t.trickle = window.setInterval(() => setBar((current) => ({ visible: true, width: current.width + (0.9 - current.width) * 0.18 })), 220);
      }, 120);
      t.safety = window.setTimeout(finish, 15_000);
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const href = pageHref(event.target);
      if (href && href !== `${window.location.pathname}${window.location.search}`) start();
    };
    const onSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (form instanceof HTMLFormElement && form.method === "get" && form.target !== "_blank") start();
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    finishRef.current = finish;
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
      clear();
    };
  }, []);

  useEffect(() => {
    finishRef.current();
  }, [pathname, query]);

  return (
    <div aria-hidden="true" className="no-print pointer-events-none fixed inset-x-0 top-0 z-[70] h-[3px]">
      <div
        className="h-full bg-gradient-to-l from-gold-400 via-teal-500 to-teal-700 transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none ltr:origin-left rtl:origin-right"
        style={{ transform: `scaleX(${bar.width})`, opacity: bar.visible ? 1 : 0 }}
      />
    </div>
  );
}

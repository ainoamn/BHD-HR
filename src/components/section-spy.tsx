"use client";

import { useEffect } from "react";

/** Marks the in-page links (`a[data-spy]`) of the section being read with aria-current, and keeps it visible in scrolling tab bars. */
export function SectionSpy({ offset = 140 }: { offset?: number }) {
  useEffect(() => {
    let frame = 0;
    let current = "";
    const update = () => {
      frame = 0;
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[data-spy]"));
      const ids = [...new Set(links.map((link) => link.hash.slice(1)).filter(Boolean))];
      let active = ids[0] || "";
      let best = -Infinity;
      for (const id of ids) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= offset && top > best) {
          best = top;
          active = id;
        }
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4 && ids.length) {
        const last = ids
          .map((id) => ({ id, top: document.getElementById(id)?.getBoundingClientRect().top ?? -Infinity }))
          .filter((item) => item.top < window.innerHeight)
          .sort((a, b) => b.top - a.top)[0];
        if (last && last.top > best) active = last.id;
      }
      if (active === current) return;
      current = active;
      for (const link of links) {
        if (link.hash.slice(1) === active) {
          link.setAttribute("aria-current", "location");
          const bar = link.closest<HTMLElement>("[data-spy-scroll]");
          if (bar) {
            const box = bar.getBoundingClientRect();
            const item = link.getBoundingClientRect();
            if (item.left < box.left || item.right > box.right) bar.scrollBy({ left: item.left + item.width / 2 - (box.left + box.width / 2), behavior: "smooth" });
          }
        } else link.removeAttribute("aria-current");
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("hashchange", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("hashchange", schedule);
    };
  }, [offset]);

  return null;
}

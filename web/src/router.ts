import { useEffect, useState } from "react";

const routePattern = /^\/(?:student\/wallet|university|transparency|verify(?:\/[^/]*)?)?\/?$/;

export const resolveAppUrl = (href: string, current: string): URL => {
  const base = new URL(current);
  const next = new URL(href, base);
  if (next.origin === base.origin && base.searchParams.get("preview") === "1" && !next.searchParams.has("preview")) {
    next.searchParams.set("preview", "1");
  }
  return next;
};

// Form and selector updates change the URL without discarding their current state.
export const replaceRoute = (href: string) => {
  const url = resolveAppUrl(href, window.location.href);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
};

export const shouldHandleLink = (event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">, anchor: HTMLAnchorElement): boolean => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self") || anchor.rel.split(/\s+/).includes("external")) return false;
  const url = new URL(anchor.href);
  return url.origin === window.location.origin && routePattern.test(url.pathname) && !anchor.getAttribute("href")?.startsWith("#") && !(url.hash && url.pathname === window.location.pathname && url.search === window.location.search);
};

// One shared router for live and preview screens. Anchors retain native browser
// semantics for new tabs, downloads, external destinations and in-page links.
export const useAppRouter = () => {
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    const onPopState = () => setNavigation(value => value + 1);
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || !shouldHandleLink(event, anchor)) return;
      const next = resolveAppUrl(anchor.href, window.location.href);
      event.preventDefault();
      if (next.href === window.location.href) return;
      window.history.pushState(null, "", next.pathname + next.search + next.hash);
      setNavigation(value => value + 1);
      window.scrollTo(0, 0);
    };
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return navigation;
};

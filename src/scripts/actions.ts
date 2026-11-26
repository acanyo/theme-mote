/**
 * Site actions shared by the context menu, the control center and the
 * keyboard shortcuts, so each behaviour is defined once.
 */
import { toggleScheme } from "./scheme";
import "./search";

type NavigatorFn = (url: string) => void;
let customNavigate: NavigatorFn | null = null;

export function setNavigator(fn: NavigatorFn | null) {
  customNavigate = fn;
}

export function navigateTo(url: string) {
  if (customNavigate) {
    customNavigate(url);
  } else {
    location.href = url;
  }
}

/** Permalinks rendered into <template data-random-posts> by ControlCenter.astro. */
function randomPermalinks(): string[] {
  const holder = document.querySelector<HTMLTemplateElement>(
    "template[data-random-posts]",
  );
  return Array.from(
    holder?.content.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
    (link) => new URL(link.getAttribute("href") ?? "/", location.href).href,
  );
}

export function openRandomPost() {
  const links = randomPermalinks().filter(
    (link) => new URL(link).pathname !== location.pathname,
  );
  if (!links.length) return false;
  navigateTo(links[Math.floor(Math.random() * links.length)]);
  return true;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function openSearch() {
  window.SearchWidget?.open();
}

export function hasSearch() {
  return Boolean(document.querySelector("[data-search]"));
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function goHome() {
  navigateTo("/");
}

export { toggleScheme };

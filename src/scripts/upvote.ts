/**
 * Official Halo 2 Upvote tracker controller (POST /apis/api.halo.run/v1alpha1/trackers/upvote).
 * Supports both Posts (`content.halo.run` / `posts`) and Moments (`moment.halo.run` / `moments`),
 * syncs duplicate triggers on the same page, persists liked state in localStorage, and works
 * across Swup SPA visits & lazy-loaded moment lists.
 */
import { gsap } from "./animation/engine";
import { motionAllowed } from "./motion";
import { toast } from "./toast";

const STORAGE_KEY = "mote-upvoted";
const UPVOTE_API = "/apis/api.halo.run/v1alpha1/trackers/upvote";

const pendingKeys = new Set<string>();

function readUpvoted(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((v): v is string => typeof v === "string"));
    }
  } catch {
    /* Storage optional */
  }
  return new Set();
}

function saveUpvoted(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set).slice(-300)));
  } catch {
    /* Storage optional */
  }
}

function makeKey(plural: string, name: string) {
  return `${plural}:${name}`;
}

export function syncUpvotedButtons(scope: ParentNode = document) {
  const upvoted = readUpvoted();
  scope
    .querySelectorAll<HTMLButtonElement>("[data-upvote]")
    .forEach((btn) => {
      const plural = btn.dataset.upvotePlural ?? "";
      const name = btn.dataset.upvoteName ?? "";
      if (!plural || !name) return;
      const liked = upvoted.has(makeKey(plural, name));
      btn.classList.toggle("is-upvoted", liked);
      btn.setAttribute("aria-pressed", String(liked));
      btn.dataset.tip = liked
        ? "已经点过赞啦"
        : plural === "moments"
          ? "点赞这条瞬间"
          : "喜欢这篇文章";
    });
}

function findMatchingButtons(plural: string, name: string): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-upvote]"),
  ).filter(
    (btn) =>
      btn.dataset.upvotePlural === plural && btn.dataset.upvoteName === name,
  );
}

function animateHeart(btn: HTMLElement) {
  if (!motionAllowed()) return;
  const icon = btn.querySelector<SVGElement>("svg");
  if (!icon) return;
  gsap.fromTo(
    icon,
    { scale: 0.85 },
    {
      scale: 1,
      duration: 0.36,
      ease: "back.out(3.2)",
      clearProps: "transform",
    },
  );
}

export async function handleUpvoteClick(btn: HTMLButtonElement) {
  const group = btn.dataset.upvoteGroup?.trim() ?? "";
  const plural = btn.dataset.upvotePlural?.trim() ?? "";
  const name = btn.dataset.upvoteName?.trim() ?? "";
  if (!group || !plural || !name) return;

  const key = makeKey(plural, name);
  const upvoted = readUpvoted();
  if (upvoted.has(key)) {
    animateHeart(btn);
    toast("已经点过赞啦", "info");
    return;
  }
  if (pendingKeys.has(key)) return;
  pendingKeys.add(key);

  const peers = findMatchingButtons(plural, name);
  const prevCounts = peers.map((el) => {
    const c = el.querySelector<HTMLElement>("[data-upvote-count]");
    return Number(c?.textContent?.trim() ?? "0") || 0;
  });

  /* Optimistic update */
  peers.forEach((el, idx) => {
    el.classList.add("is-upvoted");
    el.setAttribute("aria-pressed", "true");
    el.dataset.tip = "已经点过赞啦";
    const c = el.querySelector<HTMLElement>("[data-upvote-count]");
    if (c) c.textContent = String(prevCounts[idx] + 1);
    animateHeart(el);
  });

  try {
    const res = await fetch(UPVOTE_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group, plural, name }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    upvoted.add(key);
    saveUpvoted(upvoted);
    toast("谢谢你的喜欢", "heart");
  } catch {
    /* Rollback optimistic state */
    peers.forEach((el, idx) => {
      el.classList.remove("is-upvoted");
      el.setAttribute("aria-pressed", "false");
      el.dataset.tip = plural === "moments" ? "点赞这条瞬间" : "喜欢这篇文章";
      const c = el.querySelector<HTMLElement>("[data-upvote-count]");
      if (c) c.textContent = String(prevCounts[idx]);
    });
    toast("点赞失败，请稍后重试", "warn");
  } finally {
    pendingKeys.delete(key);
  }
}

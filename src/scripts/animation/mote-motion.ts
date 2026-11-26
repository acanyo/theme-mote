/**
 * Restrained 120fps GSAP motion choreography for Swup page views.
 * Follows Motion Director rules:
 * - Hero-first choreography on article/project detail pages (head leads, cover settles with subtle scale)
 * - Unified micro-cascade stagger (< 400ms total budget, capped to 8 lead elements)
 * - GPU-only compositor properties (y, scale, opacity, force3D) + clearProps
 * - Scoped inside gsap.context() so Swup teardown leaves zero stray tweens
 */
import { gsap, settleEase } from "./engine";
import { motionAllowed } from "../motion";

const ENTER_SELECTOR = [
  ".home-intro",
  ".page-head",
  ".guestbook-head",
  ".article-head",
  ".post-row-item",
  ".archive-post-item",
  ".index-post",
  ".taxonomy-group",
  ".timeline-item",
  ".moment-list-item",
  ".filmstrip-frame",
  ".link-card",
  ".portfolio-card",
  ".eq-card",
  ".db-card",
  ".minimal-grid > li",
  ".closing-letter",
].join(", ");

export function animatePageEnter(): () => void {
  if (!motionAllowed()) return () => {};

  const main = document.getElementById("main");
  if (!main) return () => {};

  const articleCover = main.querySelector<HTMLElement>(
    ".article-cover, .guestbook-cover",
  );
  const all = Array.from(main.querySelectorAll<HTMLElement>(ENTER_SELECTOR));
  // Cap animated targets to above-the-fold lead items for locked 60/120fps & <400ms budget.
  const targets = all.slice(0, 8);
  if (!targets.length && !articleCover) return () => {};

  const ctx = gsap.context(() => {
    if (targets.length) {
      gsap.fromTo(
        targets,
        { opacity: 0, y: 7 },
        {
          opacity: 1,
          y: 0,
          duration: 0.26,
          stagger: 0.02,
          ease: settleEase,
          force3D: true,
          clearProps: "transform,opacity",
          overwrite: "auto",
        },
      );
    }

    // Secondary hero cover settles 45ms after headline with restrained 0% overshoot
    if (articleCover) {
      gsap.fromTo(
        articleCover,
        { opacity: 0, y: 8, scale: 0.99 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          delay: 0.045,
          duration: 0.34,
          ease: settleEase,
          force3D: true,
          clearProps: "transform,opacity",
          overwrite: "auto",
        },
      );
    }
  }, main);

  return () => ctx.revert();
}

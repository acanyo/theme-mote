/**
 * Frosted Friend-Link Application Modal controller for halo-sigs/plugin-links:
 * - GSAP modal open/close with Escape & backdrop dismissal
 * - Lazy stateless CAPTCHA loading on first open (no wasted requests on page load)
 * - One-click copy of theme-configurable site exchange info
 * - Live avatar URL preview
 * - JSON submission (POST /apis/api.link.halo.run/v1alpha1/link-applications) with
 *   automatic native POST fallback & single-use captcha refresh
 */
import { copyText } from "./actions";
import { gsap, settleEase } from "./animation/engine";
import { motionAllowed } from "./motion";
import { toast } from "./toast";

const CAPTCHA_API = "/apis/api.link.halo.run/v1alpha1/link-applications/captcha";
const SUBMIT_API = "/apis/api.link.halo.run/v1alpha1/link-applications";

export function initLinkApply(): () => void {
  const modal = document.querySelector<HTMLElement>("[data-link-modal]");
  const sheet = modal?.querySelector<HTMLElement>("[data-link-modal-sheet]");
  const form = modal?.querySelector<HTMLFormElement>("[data-link-apply-form]");
  const openBtns = Array.from(
    document.querySelectorAll<HTMLElement>("[data-link-modal-open]"),
  );
  if (!modal || !sheet || !form) return () => {};

  const logoInput = form.querySelector<HTMLInputElement>("[data-logo-input]");
  const logoWrap = form.querySelector<HTMLElement>("[data-logo-preview]");
  const logoImg = form.querySelector<HTMLImageElement>(
    "[data-logo-preview-img]",
  );
  const captchaBtn = form.querySelector<HTMLButtonElement>(
    "[data-captcha-refresh]",
  );
  const captchaImg = form.querySelector<HTMLImageElement>("[data-captcha-img]");
  const submitBtn = form.querySelector<HTMLButtonElement>("[data-apply-submit]");
  const submitLabel = form.querySelector<HTMLElement>(
    "[data-apply-submit-label]",
  );
  const feedback = form.querySelector<HTMLElement>("[data-apply-feedback]");

  let isOpen = false;
  let captchaLoaded = false;
  let challengeId = "";
  let restAvailable = true;
  let lastTrigger: HTMLElement | null = null;

  const setFeedback = (kind: "success" | "error" | null, msg = "") => {
    if (!feedback) return;
    if (!kind) {
      feedback.hidden = true;
      feedback.className = "apply-feedback";
      feedback.textContent = "";
      return;
    }
    feedback.hidden = false;
    feedback.className = `apply-feedback is-${kind}`;
    feedback.textContent = msg;
  };

  const loadCaptcha = async () => {
    if (!captchaImg || !captchaBtn) return;
    captchaLoaded = true;
    captchaBtn.classList.add("is-loading");
    try {
      const res = await fetch(CAPTCHA_API, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = (await res.json()) as {
          challengeId?: string;
          image?: string;
        };
        if (data.challengeId && data.image) {
          challengeId = data.challengeId;
          captchaImg.src = data.image;
          restAvailable = true;
          return;
        }
      }
      restAvailable = false;
      challengeId = "";
      captchaImg.src = `/links/apply/captcha?t=${Date.now()}`;
    } catch {
      restAvailable = false;
      challengeId = "";
      captchaImg.src = `/links/apply/captcha?t=${Date.now()}`;
    } finally {
      captchaBtn.classList.remove("is-loading");
    }
  };

  const openModal = (trigger?: HTMLElement | null) => {
    if (isOpen) return;
    isOpen = true;
    lastTrigger = trigger ?? null;
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    if (!captchaLoaded) void loadCaptcha();

    if (motionAllowed()) {
      gsap.killTweensOf([modal, sheet]);
      gsap.fromTo(modal, { opacity: 0 }, { opacity: 1, duration: 0.18, ease: "power2.out" });
      gsap.fromTo(
        sheet,
        { opacity: 0, y: 12, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.26,
          ease: settleEase,
          clearProps: "transform",
        },
      );
    }

    const firstInput = form.querySelector<HTMLInputElement>(
      'input[name="displayName"]',
    );
    requestAnimationFrame(() => firstInput?.focus());
  };

  const closeModal = () => {
    if (!isOpen) return;
    isOpen = false;
    document.body.style.overflow = "";

    const finish = () => {
      modal.hidden = true;
      lastTrigger?.focus();
    };

    if (motionAllowed()) {
      gsap.killTweensOf([modal, sheet]);
      gsap.to(sheet, { opacity: 0, y: 8, scale: 0.98, duration: 0.16, ease: "power2.in" });
      gsap.to(modal, {
        opacity: 0,
        duration: 0.16,
        ease: "power2.in",
        onComplete: finish,
      });
    } else {
      finish();
    }
  };

  openBtns.forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn));
  });

  modal
    .querySelectorAll<HTMLElement>("[data-link-modal-close]")
    .forEach((el) => el.addEventListener("click", closeModal));

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape" && isOpen) closeModal();
  };
  document.addEventListener("keydown", onKeydown);

  /* Support deep-linking via /links#link-apply */
  if (location.hash === "#link-apply") {
    openModal();
  }

  /* One-click copy all site info */
  const copyAllBtn = modal.querySelector<HTMLButtonElement>(
    "[data-copy-site-info]",
  );
  if (copyAllBtn) {
    const labelEl = copyAllBtn.querySelector("span");
    const defaultLabel = labelEl?.textContent ?? "一键复制";
    let timer: number | undefined;

    copyAllBtn.addEventListener("click", async () => {
      const name = copyAllBtn.dataset.siteName?.trim() || document.title;
      const url = copyAllBtn.dataset.siteUrl?.trim() || location.origin;
      const desc = copyAllBtn.dataset.siteDesc?.trim() || "";
      const avatar = copyAllBtn.dataset.siteAvatar?.trim() || "";
      const feed = copyAllBtn.dataset.siteFeed?.trim() || "";
      const lines = [`名称：${name}`, `网址：${url}`];
      if (desc) lines.push(`简介：${desc}`);
      if (avatar) {
        const fullAvatar = /^https?:\/\//i.test(avatar)
          ? avatar
          : new URL(avatar, location.origin).href;
        lines.push(`头像：${fullAvatar}`);
      }
      if (feed) {
        const fullFeed = /^https?:\/\//i.test(feed)
          ? feed
          : new URL(feed, location.origin).href;
        lines.push(`订阅：${fullFeed}`);
      }
      const ok = await copyText(lines.join("\n"));
      if (ok) {
        copyAllBtn.classList.add("is-copied");
        if (labelEl) labelEl.textContent = "已复制 ✓";
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          copyAllBtn.classList.remove("is-copied");
          if (labelEl) labelEl.textContent = defaultLabel;
        }, 1400);
        toast("已复制全部本站信息");
      } else {
        toast("复制失败");
      }
    });
  }

  /* Per-field click-to-copy chips for site exchange info */
  modal
    .querySelectorAll<HTMLButtonElement>("[data-copy-field]")
    .forEach((chip) => {
      const labelEl = chip.querySelector("span");
      const defaultLabel = labelEl?.textContent ?? "";
      let timer: number | undefined;

      chip.addEventListener("click", async () => {
        const field = chip.dataset.copyField ?? "内容";
        let value = chip.dataset.copyValue?.trim() ?? "";
        if (!value) return;
        if (
          chip.dataset.copyResolveUrl === "true" &&
          !/^https?:\/\//i.test(value)
        ) {
          value = new URL(value, location.origin).href;
        }
        const ok = await copyText(value);
        if (ok) {
          chip.classList.add("is-copied");
          if (labelEl) labelEl.textContent = "已复制 ✓";
          clearTimeout(timer);
          timer = window.setTimeout(() => {
            chip.classList.remove("is-copied");
            if (labelEl) labelEl.textContent = defaultLabel;
          }, 1400);
          toast(`已复制${field}`);
        } else {
          toast("复制失败");
        }
      });
    });

  /* Live Logo Preview */
  if (logoInput && logoWrap && logoImg) {
    const syncPreview = () => {
      const val = logoInput.value.trim();
      if (/^https?:\/\/\S+$/i.test(val)) {
        logoImg.src = val;
        logoWrap.hidden = false;
      } else {
        logoWrap.hidden = true;
      }
    };
    logoImg.addEventListener("error", () => {
      logoWrap.hidden = true;
    });
    logoInput.addEventListener("input", syncPreview);
    logoInput.addEventListener("change", syncPreview);
  }

  captchaBtn?.addEventListener("click", () => {
    void loadCaptcha();
  });

  form.addEventListener("submit", async (event) => {
    if (!restAvailable || !challengeId) {
      if (!form.reportValidity()) event.preventDefault();
      return;
    }

    event.preventDefault();
    setFeedback(null);

    if (!form.reportValidity()) return;

    const fd = new FormData(form);
    const displayName = String(fd.get("displayName") ?? "").trim();
    const url = String(fd.get("url") ?? "").trim();
    const logo = String(fd.get("logo") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const description = String(fd.get("description") ?? "").trim();
    const backlink = String(fd.get("backlink") ?? "").trim();
    const captchaCode = String(fd.get("captchaCode") ?? "").trim();
    const feedUrls = String(fd.get("feedUrls") ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {
      displayName,
      url,
      challengeId,
      captchaCode,
    };
    if (logo) payload.logo = logo;
    if (email) payload.email = email;
    if (description) payload.description = description;
    if (backlink) payload.backlink = backlink;
    if (feedUrls.length) payload.feedUrls = feedUrls;

    if (submitBtn) submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = "提交中…";

    try {
      const res = await fetch(SUBMIT_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        form.reset();
        if (logoWrap) logoWrap.hidden = true;
        setFeedback(
          "success",
          "友链申请已提交成功！审核通过后会自动展示在友链页。",
        );
        toast("友链申请已提交");
        void loadCaptcha();
        return;
      }

      let message = "提交失败，请检查填写内容与验证码后重试。";
      try {
        const err = (await res.json()) as {
          detail?: string;
          message?: string;
          title?: string;
        };
        message = err.detail || err.message || err.title || message;
      } catch {
        /* Keep default message */
      }
      setFeedback("error", message);
      const codeInput = form.querySelector<HTMLInputElement>(
        'input[name="captchaCode"]',
      );
      if (codeInput) codeInput.value = "";
      void loadCaptcha();
    } catch {
      setFeedback("error", "网络请求失败，请稍后重试。");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = "提交申请";
    }
  });

  return () => {
    document.removeEventListener("keydown", onKeydown);
    if (isOpen) document.body.style.overflow = "";
    gsap.killTweensOf([modal, sheet]);
  };
}

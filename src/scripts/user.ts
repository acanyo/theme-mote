/**
 * Header login, authenticated account & commenting-guest identity menu.
 * - Authenticated Halo user: avatar/initial -> popover (Footprints, UC, Console, Logout)
 * - Commenting visitor (guest): avatar/initial -> popover (Footprints, Login, Clear Guest)
 * - Anonymous visitor: crisp user icon -> direct link to `/login`
 */
import {
  FOOTPRINTS_EVENT,
  GUEST_PROFILE_EVENT,
  OPEN_FOOTPRINTS_EVENT,
  clearGuestProfile,
  getFootprintTotal,
  getGuestProfile,
  gravatarSha256Url,
  setFootprintAccountInfo,
  type GuestProfile,
} from "./footprints";
import { toast } from "./toast";

interface HaloRole {
  metadata?: {
    name?: string;
    annotations?: Record<string, string>;
  };
}

interface DetailedUser {
  user?: {
    metadata?: { name?: string };
    spec?: { displayName?: string; avatar?: string };
  };
  roles?: HaloRole[];
}

function canAccessConsole(data: DetailedUser): boolean {
  const roles = Array.isArray(data.roles) ? data.roles : [];
  return roles.some((role) => {
    const name = role?.metadata?.name ?? "";
    if (name === "super-role") return true;
    const uiPerms =
      role?.metadata?.annotations?.["rbac.authorization.halo.run/ui-permissions"]?.trim() ??
      "";
    return Boolean(uiPerms && uiPerms !== "[]");
  });
}

export function initUserMenu(): void {
  const wrap = document.querySelector<HTMLElement>("[data-user-menu]");
  const trigger = wrap?.querySelector<HTMLAnchorElement>("[data-user-trigger]");
  const iconEl = wrap?.querySelector<HTMLElement>("[data-user-icon]");
  const avatarEl = wrap?.querySelector<HTMLImageElement>("[data-user-avatar]");
  const initialEl = wrap?.querySelector<HTMLElement>("[data-user-initial]");
  const popover = wrap?.querySelector<HTMLElement>("[data-user-popover]");
  const nameEl = wrap?.querySelector<HTMLElement>("[data-user-name]");
  const tagEl = wrap?.querySelector<HTMLElement>("[data-user-tag]");
  const handleEl = wrap?.querySelector<HTMLElement>("[data-user-handle]");
  const fpBtn = wrap?.querySelector<HTMLButtonElement>("[data-user-footprints]");
  const fpBadge = wrap?.querySelector<HTMLElement>("[data-user-fp-badge]");
  const loginLink = wrap?.querySelector<HTMLAnchorElement>("[data-user-login]");
  const ucLink = wrap?.querySelector<HTMLAnchorElement>("[data-user-uc]");
  const consoleLink = wrap?.querySelector<HTMLAnchorElement>("[data-user-console]");
  const logoutLink = wrap?.querySelector<HTMLAnchorElement>("[data-user-logout]");
  const clearGuestBtn = wrap?.querySelector<HTMLButtonElement>(
    "[data-user-clear-guest]",
  );

  if (!wrap || !trigger || !iconEl || !avatarEl || !initialEl || !popover) {
    return;
  }

  let mode: "anonymous" | "guest" | "account" = "anonymous";
  let open = false;
  let avatarReqToken = 0;

  const setOpen = (next: boolean) => {
    if (mode === "anonymous" && next) return;
    open = next;
    if (next) {
      popover.hidden = false;
      requestAnimationFrame(() => wrap.classList.add("is-open"));
    } else {
      wrap.classList.remove("is-open");
      window.setTimeout(() => {
        if (!open) popover.hidden = true;
      }, 180);
    }
    trigger.setAttribute("aria-expanded", String(next));
  };

  const showOutlineIcon = () => {
    iconEl.hidden = false;
    avatarEl.hidden = true;
    initialEl.hidden = true;
  };

  const showInitial = (letter: string) => {
    iconEl.hidden = true;
    avatarEl.hidden = true;
    initialEl.textContent = letter;
    initialEl.hidden = false;
  };

  const showAvatar = (src: string, alt: string, fallbackInitial: string) => {
    avatarEl.alt = alt;
    avatarEl.onerror = () => showInitial(fallbackInitial);
    avatarEl.src = src;
    iconEl.hidden = true;
    initialEl.hidden = true;
    avatarEl.hidden = false;
  };

  const syncFootprintBadge = () => {
    if (!fpBadge) return;
    const total = getFootprintTotal();
    fpBadge.textContent = total > 99 ? "99+" : String(total);
    fpBadge.hidden = total === 0;
  };

  const applyAnonymous = () => {
    mode = "anonymous";
    setOpen(false);
    showOutlineIcon();
    trigger.href = "/login";
    trigger.removeAttribute("aria-haspopup");
    trigger.removeAttribute("aria-expanded");
    trigger.setAttribute("aria-label", "登录");
    trigger.dataset.tip = "登录";
    setFootprintAccountInfo({
      mode: "anonymous",
      displayName: "访客",
      sub: "足迹仅保存在当前浏览器",
    });
  };

  const applyGuest = (guest: GuestProfile) => {
    mode = "guest";
    const displayName = guest.displayName.trim() || "访客";
    const initial = Array.from(displayName)[0]?.toUpperCase() || "访";
    const sub =
      guest.email ||
      (guest.website ? guest.website.replace(/^https?:\/\//i, "").replace(/\/.*$/, "") : "本站评论访客");

    trigger.href = "/login";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", `${displayName} · 访客菜单`);
    trigger.dataset.tip = `${displayName} · 足迹与登录`;

    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) {
      tagEl.textContent = "访客";
      tagEl.hidden = false;
    }
    if (handleEl) {
      handleEl.textContent = sub;
      handleEl.hidden = !sub;
    }
    if (loginLink) loginLink.hidden = false;
    if (ucLink) ucLink.hidden = true;
    if (consoleLink) consoleLink.hidden = true;
    if (logoutLink) logoutLink.hidden = true;
    if (clearGuestBtn) clearGuestBtn.hidden = false;

    const token = ++avatarReqToken;
    if (guest.avatar) {
      showAvatar(guest.avatar, displayName, initial);
      setFootprintAccountInfo({
        mode: "guest",
        displayName,
        sub,
        avatar: guest.avatar,
      });
    } else {
      showInitial(initial);
      setFootprintAccountInfo({
        mode: "guest",
        displayName,
        sub,
      });
      if (guest.email) {
        void gravatarSha256Url(guest.email).then((url) => {
          if (!url || token !== avatarReqToken || mode !== "guest") return;
          showAvatar(url, displayName, initial);
          setFootprintAccountInfo({
            mode: "guest",
            displayName,
            sub,
            avatar: url,
          });
        });
      }
    }
  };

  const applyAccount = (data: DetailedUser) => {
    const username = data.user?.metadata?.name?.trim() ?? "";
    const displayName = data.user?.spec?.displayName?.trim() || username;
    const avatar = data.user?.spec?.avatar?.trim() || "";
    const initial = Array.from(displayName)[0]?.toUpperCase() || "U";

    mode = "account";
    avatarReqToken++;
    trigger.href = "/uc";
    trigger.setAttribute("aria-haspopup", "menu");
    trigger.setAttribute("aria-expanded", String(open));
    trigger.setAttribute("aria-label", `${displayName} · 账号菜单`);
    trigger.dataset.tip = displayName;

    if (nameEl) nameEl.textContent = displayName;
    if (tagEl) tagEl.hidden = true;
    if (handleEl) {
      handleEl.textContent = `@${username}`;
      handleEl.hidden = false;
    }
    if (loginLink) loginLink.hidden = true;
    if (ucLink) ucLink.hidden = false;
    if (consoleLink) consoleLink.hidden = !canAccessConsole(data);
    if (logoutLink) logoutLink.hidden = false;
    if (clearGuestBtn) clearGuestBtn.hidden = true;

    if (avatar) {
      showAvatar(avatar, displayName, initial);
    } else {
      showInitial(initial);
    }

    setFootprintAccountInfo({
      mode: "account",
      displayName,
      sub: `@${username}`,
      avatar: avatar || undefined,
    });
  };

  trigger.addEventListener("click", (event) => {
    if (mode === "anonymous") return;
    event.preventDefault();
    event.stopPropagation();
    syncFootprintBadge();
    setOpen(!open);
  });

  fpBtn?.addEventListener("click", () => {
    setOpen(false);
    document.dispatchEvent(
      new CustomEvent(OPEN_FOOTPRINTS_EVENT, { detail: trigger }),
    );
  });

  clearGuestBtn?.addEventListener("click", () => {
    clearGuestProfile();
    applyAnonymous();
    toast("已清除本地访客信息", "info");
  });

  document.addEventListener("click", (event) => {
    if (!open || !(event.target instanceof Node)) return;
    if (!wrap.contains(event.target)) setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      trigger.focus();
    }
  });

  window.addEventListener(
    "scroll",
    () => {
      if (open) setOpen(false);
    },
    { passive: true },
  );

  document.addEventListener(FOOTPRINTS_EVENT, syncFootprintBadge);
  document.addEventListener(GUEST_PROFILE_EVENT, () => {
    if (mode === "account") return;
    const guest = getGuestProfile();
    if (guest) applyGuest(guest);
    else applyAnonymous();
  });

  /* Hydrate local guest profile immediately for zero perceived delay */
  syncFootprintBadge();
  const initialGuest = getGuestProfile();
  if (initialGuest) {
    applyGuest(initialGuest);
  }

  /* Verify live Halo account session (overrides guest state when signed in) */
  void fetch("/apis/api.console.halo.run/v1alpha1/users/-", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then((res) => (res.ok ? (res.json() as Promise<DetailedUser>) : null))
    .then((data) => {
      const username = data?.user?.metadata?.name?.trim() ?? "";
      if (!data || !username || username === "anonymousUser") return;
      applyAccount(data);
    })
    .catch(() => {
      /* Keep local guest or anonymous state silently */
    });
}

/**
 * Header login & authenticated account menu powered by Halo's live user endpoint.
 * - Defaults to a zero-CLS `/login` icon link when unauthenticated or unreachable
 * - Hydrates into the signed-in user's avatar/initial with a frosted account popover
 */

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
  const handleEl = wrap?.querySelector<HTMLElement>("[data-user-handle]");
  const consoleLink = wrap?.querySelector<HTMLAnchorElement>("[data-user-console]");

  if (!wrap || !trigger || !iconEl || !avatarEl || !initialEl || !popover) {
    return;
  }

  let authenticated = false;
  let open = false;

  const setOpen = (next: boolean) => {
    if (!authenticated && next) return;
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

  const showInitial = (letter: string) => {
    iconEl.hidden = true;
    avatarEl.hidden = true;
    initialEl.textContent = letter;
    initialEl.hidden = false;
  };

  trigger.addEventListener("click", (event) => {
    if (!authenticated) return;
    event.preventDefault();
    event.stopPropagation();
    setOpen(!open);
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

  void fetch("/apis/api.console.halo.run/v1alpha1/users/-", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  })
    .then((res) => (res.ok ? (res.json() as Promise<DetailedUser>) : null))
    .then((data) => {
      const username = data?.user?.metadata?.name?.trim() ?? "";
      if (!data || !username || username === "anonymousUser") return;

      const displayName = data.user?.spec?.displayName?.trim() || username;
      const avatar = data.user?.spec?.avatar?.trim() || "";
      const initial = Array.from(displayName)[0]?.toUpperCase() || "U";

      authenticated = true;
      trigger.href = "/uc";
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", `${displayName} · 账号菜单`);
      trigger.dataset.tip = displayName;

      if (nameEl) nameEl.textContent = displayName;
      if (handleEl) handleEl.textContent = `@${username}`;
      if (consoleLink) consoleLink.hidden = !canAccessConsole(data);

      if (avatar) {
        avatarEl.alt = displayName;
        avatarEl.onerror = () => showInitial(initial);
        avatarEl.src = avatar;
        iconEl.hidden = true;
        initialEl.hidden = true;
        avatarEl.hidden = false;
      } else {
        showInitial(initial);
      }
    })
    .catch(() => {
      /* Stay in unauthenticated `/login` state silently */
    });
}

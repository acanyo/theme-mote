/** True when the link points at the page currently open (ignoring hashes and trailing slashes). */
export function sameDestination(link: HTMLAnchorElement): boolean {
  const url = new URL(link.href, location.href);
  if (url.origin !== location.origin || url.hash) return false;
  const clean = (path: string) => path.replace(/\/+$/, "") || "/";
  return clean(url.pathname) === clean(location.pathname);
}

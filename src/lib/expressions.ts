/**
 * Thymeleaf expression snippets shared by several components.
 * Each one expects the named variable to be bound by the caller.
 */

/** Plain-text preview of a moment (`moment` bound), inline #tags and HTML stripped. */
export const momentText = (length: number) =>
  `\${#strings.abbreviate(#strings.trim((moment.spec.content.html ?: '').replaceAll('<a[^>]*class="[^"]*\\btag\\b[^"]*"[^>]*>[^<]*</a>', ' ').replaceAll('<[^>]+>', ' ').replaceAll('&nbsp;', ' ').replaceAll('\\s+', ' ')), ${length})}`;

/** Avatar from theme settings (basic → legacy home → site logo). */
export const AVATAR =
  "not #strings.isEmpty(theme.config.basic?.avatar) ? theme.config.basic.avatar : (not #strings.isEmpty(theme.config.home?.avatar) ? theme.config.home.avatar : site.logo)";

/// <reference types="astro/client" />

// Thymeleaf attributes pass through Astro untouched and are evaluated by Halo.
declare namespace astroHTML.JSX {
  interface HTMLAttributes {
    [key: `th:${string}`]: string | undefined;
  }
}

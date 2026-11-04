import { getRequestConfig } from "next-intl/server";

/**
 * i18n preparada pero solo con español. Para añadir un idioma: crear
 * messages/<locale>.json y decidir cómo se elige el locale (cookie, perfil...).
 */
export const DEFAULT_LOCALE = "es";

export default getRequestConfig(async () => {
  const locale = DEFAULT_LOCALE;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Madrid",
  };
});

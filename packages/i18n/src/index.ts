// =============================================================================
// o.company · i18n
// =============================================================================
// Lightweight translation helper. We use a flat key/value store per locale
// (no ICU MessageFormat) because the company's copy is short, opinionated,
// and rarely needs plurals or gender. The real win is being able to swap
// locales at the edge without depending on next-intl or any runtime.
//
// Locales we ship: en, es, pt-BR, fr, ar, hi, tl (Filipino). Add more by
// dropping a JSON file in src/locales/ and extending the Localized type.

export const LOCALES = ["en", "es", "pt-BR", "fr", "ar", "hi", "tl"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en:    "English",
  es:    "Español",
  "pt-BR": "Português (Brasil)",
  fr:    "Français",
  ar:    "العربية",
  hi:    "हिन्दी",
  tl:    "Filipino",
};

/** English is the source of truth. Other locales override specific keys. */
type Strings = Record<string, string>;

const en: Strings = {
  "app.name":       "o.company",
  "app.tagline":    "Your business, operated.",
  "nav.dashboard":  "Dashboard",
  "nav.contacts":   "Contacts",
  "nav.deals":      "Deals",
  "nav.projects":   "Projects",
  "nav.invoices":   "Invoices",
  "nav.time":       "Time",
  "nav.tickets":    "Support",
  "nav.settings":   "Settings",
  "nav.people":     "People",
  "common.save":     "Save",
  "common.cancel":  "Cancel",
  "common.delete":  "Delete",
  "common.edit":    "Edit",
  "common.create":  "Create",
  "common.send":    "Send",
  "common.search":  "Search",
  "common.loading": "Loading…",
  "common.empty":   "Nothing here yet.",
  "common.error":   "Something went wrong.",
  "common.retry":   "Try again",
  "billing.paid":   "Paid",
  "billing.unpaid": "Unpaid",
  "billing.overdue":"Overdue",
  "auth.signIn":    "Sign in",
  "auth.signOut":   "Sign out",
};

const overrides: Partial<Record<Locale, Strings>> = {
  es: {
    "app.name":       "o.company",
    "app.tagline":    "Tu negocio, operado.",
    "nav.dashboard":  "Panel",
    "nav.contacts":   "Contactos",
    "nav.deals":      "Negocios",
    "nav.projects":   "Proyectos",
    "nav.invoices":   "Facturas",
    "nav.time":       "Tiempo",
    "nav.tickets":    "Soporte",
    "nav.settings":   "Ajustes",
    "nav.people":     "Personas",
    "common.save":    "Guardar",
    "common.cancel":  "Cancelar",
    "common.delete":  "Eliminar",
    "common.edit":    "Editar",
    "common.create":  "Crear",
    "common.send":    "Enviar",
    "common.search":  "Buscar",
    "common.loading": "Cargando…",
    "common.empty":   "Nada aquí todavía.",
    "common.error":   "Algo salió mal.",
    "common.retry":   "Reintentar",
    "auth.signIn":    "Iniciar sesión",
    "auth.signOut":   "Cerrar sesión",
  },
  "pt-BR": {
    "app.name":       "o.company",
    "app.tagline":    "Seu negócio, operado.",
    "nav.dashboard":  "Painel",
    "nav.contacts":   "Contatos",
    "nav.deals":      "Negócios",
    "nav.projects":   "Projetos",
    "nav.invoices":   "Faturas",
    "nav.time":       "Tempo",
    "nav.tickets":    "Suporte",
    "nav.settings":   "Configurações",
    "nav.people":     "Pessoas",
    "common.save":    "Salvar",
    "common.cancel":  "Cancelar",
    "common.delete":  "Excluir",
    "common.edit":    "Editar",
    "common.create":  "Criar",
    "common.send":    "Enviar",
    "common.search":  "Buscar",
    "common.loading": "Carregando…",
    "common.empty":   "Nada aqui ainda.",
    "common.error":   "Algo deu errado.",
    "common.retry":   "Tentar novamente",
    "auth.signIn":    "Entrar",
    "auth.signOut":   "Sair",
  },
};

const dictionaries: Record<Locale, Strings> = {
  en,
  es:        { ...en, ...overrides.es },
  "pt-BR":   { ...en, ...overrides["pt-BR"] },
  fr:        { ...en },  // fallback to en for now
  ar:        { ...en },  // RTL: layout handled by Compose
  hi:        { ...en },
  tl:        { ...en },
};

/** Detect the best locale from the request. */
export function detectLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return "en";
  const requested = acceptLanguage.split(",").map((s) => {
    const [tag, q] = s.trim().split(";");
    return { tag: tag.toLowerCase(), q: q ? Number(q.split("=")[1]) : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const { tag } of requested) {
    if (tag === "pt-br" || tag === "pt") return "pt-BR";
    if (LOCALES.includes(tag as Locale)) return tag as Locale;
    const base = tag.split("-")[0];
    if (LOCALES.includes(base as Locale)) return base as Locale;
  }
  return "en";
}

/** Get a translated string. Falls back to English, then to the key itself. */
export function t(locale: Locale, key: keyof Strings | string): string {
  return dictionaries[locale]?.[key] ?? en[key] ?? key;
}

/** Currency-aware number formatting. */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

/** Locale-aware date formatting. */
export function formatDate(date: Date | string, locale: Locale, opts?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, opts ?? { year: "numeric", month: "short", day: "numeric" }).format(d);
}

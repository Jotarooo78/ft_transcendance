/** Pied de page commun à tous les écrans : liens vers les pages légales. */
import { useLanguage } from "../hooks/useLanguage";
import { useLegalRoute } from "../hooks/useLegalRoute";
import { legalHref } from "../services/legal-navigation";
import { translate as t } from "../services/translate";
import { legalDocuments } from "../translations/legal";

/** Les titres des liens viennent des documents eux-mêmes, pour rester identiques à la page ouverte. */
export default function SiteFooter() {
  const language = useLanguage();
  const route = useLegalRoute();
  return (
    <footer className="site-footer">
      <span>{t("FT GoodVibes")}</span>
      <nav aria-label={t("Legal information")}>
        {(["privacy", "terms"] as const).map((id) => (
          <a
            key={id}
            href={legalHref(id)}
            aria-current={route === id ? "page" : undefined}
          >
            {legalDocuments[id][language].title}
          </a>
        ))}
      </nav>
    </footer>
  );
}

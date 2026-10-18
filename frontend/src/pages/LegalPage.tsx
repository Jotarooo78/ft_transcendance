/** Politique de confidentialité ou conditions d’utilisation, dans la langue choisie. */
import { useEffect, useRef } from "react";
import { useLanguage } from "../hooks/useLanguage";
import { translate as t } from "../services/translate";
import {
  legalDocuments,
  legalUpdatedAt,
  type LegalDocumentId,
} from "../translations/legal";

/** Affiche le document en haut de page et y place le focus pour les lecteurs d’écran. */
export default function LegalPage({ id }: { id: LegalDocumentId }) {
  const language = useLanguage();
  const document = legalDocuments[id][language];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    heading.current?.focus();
  }, [id]);
  const updatedAt = new Intl.DateTimeFormat(language, {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(legalUpdatedAt));
  return (
    <main className="legal-page">
      <header>
        <h1 ref={heading} tabIndex={-1}>
          {document.title}
        </h1>
        <p>{t("Last updated: {date}", { date: updatedAt })}</p>
        <p>{document.summary}</p>
      </header>
      {document.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.items && (
            <ul>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <p>
        <a href="#">{t("Back to FT GoodVibes")}</a>
      </p>
    </main>
  );
}

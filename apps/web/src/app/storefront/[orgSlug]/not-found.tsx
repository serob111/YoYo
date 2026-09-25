import { getI18n } from "@/lib/i18n/server";
import styles from "./storefront.module.css";

export default function StorefrontNotFound() {
  const { t: translateText, locale, intlLocale } = getI18n();
  return (
    <div className={styles.page}>
      <div className={styles.notFound}>
        <div>
          <h1>{translateText("Витрина не найдена")}</h1>
          <p>{translateText("Такого агентства не существует, либо ссылка устарела.")}</p>
          <a className={styles.notFoundLink} href="/">
             {translateText("На главную")} </a>
        </div>
      </div>
    </div>
  );
}

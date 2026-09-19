import styles from "./storefront.module.css";

export default function StorefrontNotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.notFound}>
        <div>
          <h1>Витрина не найдена</h1>
          <p>Такого агентства не существует, либо ссылка устарела.</p>
          <a className={styles.notFoundLink} href="/">
            На главную
          </a>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import styles from "./account.module.css";

export function AccountShell({
  title,
  subtitle,
  children,
  footer,
  centered
}: {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  centered?: boolean;
}) {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.logo}>
        <i />
        YoYo
      </Link>
      <div className={styles.card} style={centered ? { textAlign: "center" } : undefined}>
        {title && <h1 className={styles.title}>{title}</h1>}
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
      {footer && <p className={styles.footerText}>{footer}</p>}
    </div>
  );
}

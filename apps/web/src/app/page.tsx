"use client";

import { useState } from "react";
import Link from "next/link";
import { DM_Sans, Manrope } from "next/font/google";
import {
  ArrowRight,
  CaretDown,
  ChatCircleDots,
  CheckCircle,
  Heart,
  House,
  List,
  MagnifyingGlass,
  MapPin,
  Play,
  SlidersHorizontal,
  UsersThree,
  X
} from "@phosphor-icons/react";
import styles from "./landing.module.css";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-dm-sans" });
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["600", "700", "800"], variable: "--font-manrope" });

type Home = {
  image: string;
  title: string;
  price: string;
  meta: string;
  tag: string;
};

const homes: Home[] = [
  { image: "/assets/yoyo-listing-interior.png", title: "3-комнатная квартира", price: "24 500 000 ₽", meta: "78 м² · Алексеевская · 12 мин", tag: "Современный дом" },
  { image: "/assets/yoyo-listing-building.png", title: "3-комнатная квартира", price: "18 900 000 ₽", meta: "72 м² · Сокол · 8 мин", tag: "Рядом парк" },
  { image: "/assets/yoyo-listing-kitchen.png", title: "2-комнатная квартира", price: "21 800 000 ₽", meta: "81 м² · Ботанический сад · 10 мин", tag: "Для семьи" }
];

const FILTERS = ["Все", "Современный дом", "Рядом парк", "Для семьи"];

function Logo() {
  return (
    <a className={styles.logo} href="#top">
      <i />
      YoYo
    </a>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header>
      <Logo />
      <button className={styles.menu} onClick={() => setOpen(!open)} aria-label="Меню">
        {open ? <X /> : <List />}
      </button>
      <nav className={open ? `${styles.navOpen}` : ""}>
        <a href="#product">
          Продукт <CaretDown />
        </a>
        <a href="#agency">Для агентств</a>
        <a href="#realtor">Для риелторов</a>
        <a href="#pricing">Тарифы</a>
      </nav>
      <div className={styles.headerActions}>
        <Link href="/login" className={styles.login}>
          Войти
        </Link>
        <Link href="/signup" className={`${styles.primary} ${styles.compact}`}>
          Начать бесплатно
        </Link>
      </div>
    </header>
  );
}

function Card({ home }: { home: Home }) {
  const [liked, setLiked] = useState(false);
  return (
    <article className={styles.card}>
      <div>
        <img src={home.image} alt={home.title} />
        <button onClick={() => setLiked(!liked)} aria-label="В избранное">
          <Heart weight={liked ? "fill" : "regular"} />
        </button>
      </div>
      <h4>{home.title}</h4>
      <strong>{home.price}</strong>
      <p>{home.meta}</p>
      <footer>
        <span>{home.tag}</span>
        <button aria-label="Открыть объект">
          <ArrowRight />
        </button>
      </footer>
    </article>
  );
}

function Demo() {
  const [filter, setFilter] = useState("Все");
  const visible = filter === "Все" ? homes : homes.filter((home) => home.tag === filter);

  return (
    <section className={styles.demo} id="product">
      <aside className={styles.side}>
        <Logo />
        <button className={styles.sideActive}>
          <MagnifyingGlass />
          Поиск
        </button>
        <button>
          <UsersThree />
          Мои клиенты
        </button>
        <button>
          <House />
          Объекты
        </button>
        <button>
          <ChatCircleDots />
          Диалоги <b>3</b>
        </button>
        <button>
          <CheckCircle />
          Сделки
        </button>
        <div className={styles.agent}>
          <img src="/assets/yoyo-realtor-vera.png" alt="Анна Ковалева" />
          <span>
            <strong>Анна Ковалева</strong>
            Риелтор
          </span>
        </div>
      </aside>

      <div className={styles.demoContent}>
        <div className={styles.question}>
          <img src="/assets/yoyo-realtor-vera.png" alt="" />
          <p>
            <small>Вера · 2 дня назад</small>
            Ищу квартиру для семьи с ребёнком.
            <br />
            2–3 комнаты, от 70 м², рядом с метро.
            <br />
            Важен современный дом и зелёный район.
          </p>
        </div>
        <div className={styles.reply}>
          Вот несколько вариантов, которые вам подойдут. Собрала с учётом всех пожеланий
          <img src="/assets/yoyo-realtor-vera.png" alt="" />
        </div>
        <div className={styles.filters}>
          {FILTERS.map((label) => (
            <button key={label} className={filter === label ? styles.filterActive : ""} onClick={() => setFilter(label)}>
              {label}
            </button>
          ))}
        </div>
        <div className={styles.cards}>
          {visible.map((home) => (
            <Card key={home.price} home={home} />
          ))}
        </div>
      </div>

      <aside className={styles.map}>
        <div className={styles.mapbar}>
          <button>
            <MapPin />
            Москва
            <CaretDown />
          </button>
          <button>
            Цена
            <CaretDown />
          </button>
          <button>
            Комнат
            <CaretDown />
          </button>
          <button aria-label="Фильтры">
            <SlidersHorizontal />
          </button>
        </div>
        <div className={styles.mapbody}>
          <button className={`${styles.pin} ${styles.pinOne}`}>18,9 млн</button>
          <button className={`${styles.pin} ${styles.pinTwo}`}>24,5 млн</button>
          <button className={`${styles.pin} ${styles.pinThree}`}>21,8 млн</button>
          <img src="/assets/yoyo-listing-building.png" alt="" />
        </div>
      </aside>
    </section>
  );
}

export default function HomePage() {
  return (
    <main id="top" className={`${styles.landing} ${dmSans.variable} ${manrope.variable}`}>
      <Header />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>AI-платформа конверсии лидов для команд в недвижимости</p>
          <h1>
            Вы приводите лиды.
            <br />
            YoYo превращает их в сделки.
          </h1>
          <p className={styles.lead}>
            Каждый новый лид попадает в единую
            <br />
            воронку: квалификация, подбор объектов,
            <br />
            показы и сопровождение — с вашей командой у руля.
          </p>
          <div className={styles.actions}>
            <Link href="/signup" className={styles.primary}>
              Начать бесплатно
            </Link>
            <a className={styles.secondary} href="#product">
              <Play weight="fill" />
              Демо платформы
            </a>
          </div>
          <div className={styles.topics}>
            <span>Лиды</span>
            <i />
            <span>Диалоги</span>
            <i />
            <span>Показы</span>
            <i />
            <span>Сделки</span>
          </div>
        </div>
        <div className={styles.heroPhoto}>
          <img src="/assets/yoyo-property-hero.png" alt="Современная квартира" />
          <b className={`${styles.arch} ${styles.archTop}`} />
          <b className={`${styles.arch} ${styles.archRight}`} />
          <em>
            Лучшие люди находят
            <br />
            свои места
          </em>
          <p>
            Дома
            <br />
            начинаются
            <br />с разговоров
          </p>
        </div>
      </section>

      <Demo />

      <section className={styles.story} id="agency">
        <div>
          <p className={styles.eyebrow}>От первого сообщения до показа</p>
          <h2>
            Новый лид сразу
            <br />
            квалифицируется
            <br />и получает подборку.
          </h2>
          <p>YoYo уточняет запрос, подбирает подходящие объекты и ведёт лид по воронке — от первого сообщения до записи на показ, а вы в любой момент можете перехватить диалог.</p>
          <Link href="/signup" className={styles.primary}>
            Начать бесплатно
          </Link>
        </div>
        <div className={styles.messages}>
          <article>
            <img src="/assets/yoyo-realtor-vera.png" alt="" />
            <p>
              <strong>Вера</strong>
              Ищу квартиру для семьи с ребёнком. 2–3 комнаты, от 70 м², рядом с метро.
            </p>
          </article>
          <article>
            <img src="/assets/yoyo-realtor-vera.png" alt="" />
            <p>
              <strong>YoYo</strong>
              Уже подбираю варианты по вашим критериям.
            </p>
          </article>
        </div>
        <div className={styles.shortlist}>
          {homes.map((home) => (
            <article key={home.price}>
              <img src={home.image} alt={home.title} />
              <span>
                <strong>{home.title}</strong>
                <b>{home.price}</b>
                <small>{home.meta}</small>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.cta} id="realtor">
        <p className={styles.eyebrow}>Больше лидов доходит до сделки</p>
        <h2>
          Ваши лиды. Ваша команда.
          <br />
          Одна система для конверсии.
        </h2>
        <Link href="/signup" className={styles.primary}>
          Запустить YoYo <ArrowRight />
        </Link>
      </section>

      <footer id="pricing" className={styles.siteFooter}>
        <Logo />
        <p>AI-платформа конверсии лидов для агентств и команд в недвижимости.</p>
        <span>© 2026 YoYo</span>
      </footer>
    </main>
  );
}

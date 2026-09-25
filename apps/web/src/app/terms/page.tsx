import { getI18n } from "@/lib/i18n/server";
import type { Metadata } from "next";

export function generateMetadata(): Metadata {
  const { t } = getI18n();
  return {
    title: t("Terms of Service — YoYo"),
    description: t("Terms of Service for the YoYo CRM and messaging platform.")
  };
}

export default function TermsPage() {
  const { t: translateText, locale, intlLocale } = getI18n();
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-semibold text-slate-900">{translateText("Terms of Service")}</h1>
      <p className="mt-2 text-sm text-slate-500">{translateText("Last updated: September 2026")}</p>

      <div className="mt-10 space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("1. Acceptance of terms")}</h2>
          <p className="mt-2">
             {translateText("By creating an account or otherwise using YoYo (\"the Service\"), you agree to these Terms of Service. If you are using the Service on behalf of a business, you represent that you have the authority to bind that business to these terms.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("2. What the Service does")}</h2>
          <p className="mt-2">
             {translateText("YoYo is a CRM and customer-messaging platform for small and mid-sized businesses. It lets you connect business accounts on third-party platforms (currently Instagram and TikTok), view and reply to customer conversations from those platforms in one place, optionally use AI-generated draft or automatic replies, and track leads through a sales pipeline.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("3. Your account and connected platforms")}</h2>
          <p className="mt-2">
             {translateText("You are responsible for the accuracy of the information in your account and for maintaining the confidentiality of your login credentials. When you connect an Instagram or TikTok account, you authorize YoYo to access and act on that account within the scope of the permissions you grant, and you remain responsible for complying with that platform's own terms of service and platform policies.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("4. Acceptable use")}</h2>
          <p className="mt-2">{translateText("You agree not to use the Service to:")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>{translateText("Send unsolicited bulk messages (spam) or otherwise violate a connected platform's messaging policies;")}</li>
            <li>{translateText("Upload or transmit unlawful, infringing, or harmful content;")}</li>
            <li>{translateText("Attempt to gain unauthorized access to other users' data or to the Service's infrastructure;")}</li>
            <li>{translateText("Use the Service in a way that violates any applicable law or the terms of a connected third-party platform.")}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("5. AI-generated content")}</h2>
          <p className="mt-2">
             {translateText("When enabled, the Service uses a third-party AI provider to draft or send replies to your customers on your behalf, based on information you provide about your business. You are responsible for reviewing how this feature is configured for your account and for the content it sends where you have enabled automatic sending.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("6. Data and content ownership")}</h2>
          <p className="mt-2">
             {translateText("You retain ownership of the business data, customer data, and content you submit to the Service. You grant YoYo a limited license to process that data solely to provide and improve the Service, as described in our")}{" "}
            <a href="/privacy" className="text-indigo-600 underline">
               {translateText("Privacy Policy")} </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("7. Termination")}</h2>
          <p className="mt-2">
             {translateText("You may stop using the Service and disconnect any connected accounts at any time. We may suspend or terminate access to the Service for accounts that violate these terms or that we reasonably believe pose a security or legal risk.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("8. Disclaimers and limitation of liability")}</h2>
          <p className="mt-2">
             {translateText("The Service is provided \"as is\" without warranties of any kind. To the maximum extent permitted by law, YoYo is not liable for indirect, incidental, or consequential damages arising from your use of the Service, including damages arising from actions taken by a connected third-party platform outside our control.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("9. Changes to these terms")}</h2>
          <p className="mt-2">
             {translateText("We may update these terms from time to time. Continued use of the Service after an update constitutes acceptance of the revised terms.")} </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">{translateText("10. Contact")}</h2>
          <p className="mt-2">{translateText("Questions about these terms can be sent to the business operating this Service.")}</p>
        </section>
      </div>
    </main>
  );
}

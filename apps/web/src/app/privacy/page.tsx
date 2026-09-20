import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — YoYo",
  description: "How YoYo collects, uses, and protects your data, including data from connected Instagram and TikTok accounts."
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-800">
      <h1 className="text-3xl font-semibold text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: September 2026</p>

      <div className="mt-10 space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold text-slate-900">1. What this policy covers</h2>
          <p className="mt-2">
            This policy describes how YoYo (&quot;the Service&quot;) collects, uses, stores, and shares information
            when you use our CRM and messaging platform, including when you connect a business Instagram or TikTok
            account.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">2. Information we collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li><strong>Account information:</strong> name, email address, and password (stored as a salted hash, never in plain text).</li>
            <li><strong>Connected-platform data:</strong> when you connect Instagram or TikTok, we receive the access tokens and permissions you grant, your connected account&apos;s profile info (username, display name, profile picture), and the customer conversations, messages, and comments that platform makes available through its API for the features you enable.</li>
            <li><strong>Customer/lead data:</strong> names, contact identifiers, message content, and CRM notes you or your team enter about your customers.</li>
            <li><strong>Usage data:</strong> log data such as IP address, browser type, and pages visited, used for security and reliability.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">3. How we use this information</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>To provide the core Service: displaying and letting you reply to conversations from your connected accounts, and organizing customer/lead records.</li>
            <li>To generate AI-assisted replies, where you have enabled that feature, by sending relevant conversation context to our AI provider.</li>
            <li>To maintain security, prevent abuse, and debug technical issues.</li>
            <li>To communicate with you about your account or material changes to the Service.</li>
          </ul>
          <p className="mt-2">
            We do not sell your data or your customers&apos; data, and we do not use data obtained from Instagram or
            TikTok for advertising purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">4. Sharing with third parties</h2>
          <p className="mt-2">We share data with the following categories of third parties, only as needed to run the Service:</p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li><strong>Meta (Instagram)</strong> and <strong>TikTok</strong> — to send and receive messages/content through the accounts you connect, subject to their own platform terms.</li>
            <li><strong>Our AI provider</strong> — to generate draft or automatic reply content, when that feature is enabled.</li>
            <li><strong>Infrastructure providers</strong> — hosting, database, and file-storage providers that process data on our behalf under confidentiality obligations.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">5. Data retention</h2>
          <p className="mt-2">
            We retain account and conversation data for as long as your account is active, so that your conversation
            history and CRM records remain available to you. If you disconnect a platform account or close your
            account, we stop syncing new data from that platform and delete platform access tokens; you may request
            deletion of your remaining data at any time.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">6. Your rights</h2>
          <p className="mt-2">
            You may request access to, correction of, or deletion of your personal data by contacting the business
            operating this Service. If you are an individual whose data was collected as a customer/lead of one of
            our business users, please contact that business directly, as they control that data; we act as their
            data processor for conversation and CRM data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">7. Security</h2>
          <p className="mt-2">
            Platform access tokens are stored encrypted at rest. Access to customer data is scoped per organization,
            and all traffic to the Service is encrypted in transit (HTTPS).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">8. Changes to this policy</h2>
          <p className="mt-2">
            We may update this policy from time to time. Material changes will be reflected by updating the &quot;Last
            updated&quot; date above.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900">9. Contact</h2>
          <p className="mt-2">Questions about this policy can be sent to the business operating this Service.</p>
        </section>
      </div>
    </main>
  );
}

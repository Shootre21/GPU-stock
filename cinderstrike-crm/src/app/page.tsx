import Link from 'next/link';
import { loadCRMData } from '@/lib/crm-data';

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition hover:shadow-md">
      <div className="text-sm text-black/60">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-black">{value}</div>
    </Link>
  );
}

export default async function Home() {
  const data = await loadCRMData();
  const nicheBreakdown = data.companies.reduce<Record<string, number>>((acc, company) => {
    acc[company.niche] = (acc[company.niche] || 0) + 1;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-8">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Cinderstrike CRM</h1>
          <p className="mt-2 text-black/65">
            Simple outreach CRM for small-business cybersecurity leads, templates, and send tracking.
          </p>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Companies" value={data.companies.length} href="/companies" />
          <StatCard label="Leads" value={data.leads.length} href="/leads" />
          <StatCard label="Templates" value={data.templates.length} href="/templates" />
          <StatCard label="Emails Sent" value={data.sends.length} href="/sends" />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Target Niches</h2>
              <Link href="/companies" className="text-sm text-blue-600 hover:underline">
                Manage companies
              </Link>
            </div>
            <div className="mt-4 space-y-3">
              {Object.entries(nicheBreakdown).map(([niche, count]) => (
                <div key={niche} className="flex items-center justify-between rounded-xl bg-black/[0.03] px-4 py-3">
                  <span className="capitalize">{niche}</span>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Recommended Workflow</h2>
              <Link href="/templates" className="text-sm text-blue-600 hover:underline">
                View templates
              </Link>
            </div>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-black/75">
              <li>Pick one niche: accounting, insurance, or dental.</li>
              <li>Add a real contact lead for each company before sending.</li>
              <li>Choose the matching template and personalize lightly.</li>
              <li>Send in small batches, then track replies and follow-ups.</li>
              <li>Upsell medium-cost hardening after the security checkup.</li>
            </ol>
          </div>
        </section>

        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Quick Links</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Link className="rounded-xl bg-black px-4 py-3 text-white" href="/companies">Companies</Link>
            <Link className="rounded-xl bg-black px-4 py-3 text-white" href="/leads">Leads</Link>
            <Link className="rounded-xl bg-black px-4 py-3 text-white" href="/templates">Templates</Link>
            <Link className="rounded-xl bg-black px-4 py-3 text-white" href="/sends">Send Log</Link>
          </div>
        </section>
      </div>
    </main>
  );
}

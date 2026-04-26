import Link from 'next/link';
import { loadCRMData } from '@/lib/crm-data';

export default async function LeadsPage() {
  const data = await loadCRMData();
  const companyMap = new Map(data.companies.map((company) => [company.id, company]));

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leads</h1>
            <p className="mt-2 text-black/65">Contacts you actually email from the target companies list.</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to dashboard</Link>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Next step: add real contact leads with names and emails before any sending automation goes live.
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-black/[0.04] text-left">
              <tr>
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-black/55">
                    No leads yet — add real contact records next.
                  </td>
                </tr>
              ) : (
                data.leads.map((lead) => (
                  <tr key={lead.id} className="border-t border-black/5 align-top">
                    <td className="px-4 py-3 font-medium">{lead.contactName}</td>
                    <td className="px-4 py-3">{companyMap.get(lead.companyId)?.name || 'Unknown company'}</td>
                    <td className="px-4 py-3">{lead.email}</td>
                    <td className="px-4 py-3">{lead.title || '—'}</td>
                    <td className="px-4 py-3">{lead.status}</td>
                    <td className="px-4 py-3 text-black/70">{lead.note || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

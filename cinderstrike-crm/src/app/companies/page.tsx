import Link from 'next/link';
import { loadCRMData } from '@/lib/crm-data';

export default async function CompaniesPage() {
  const data = await loadCRMData();

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold">Companies</h1>
            <p className="mt-2 text-black/65">Initial Albany targets for cybersecurity outreach.</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to dashboard</Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-black/[0.04] text-left">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Niche</th>
                <th className="px-4 py-3">Website</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.companies.map((company) => (
                <tr key={company.id} className="border-t border-black/5 align-top">
                  <td className="px-4 py-3 font-medium">{company.name}</td>
                  <td className="px-4 py-3 capitalize">{company.niche}</td>
                  <td className="px-4 py-3">
                    <a href={company.website} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                      {company.website}
                    </a>
                  </td>
                  <td className="px-4 py-3">{company.phone || '—'}</td>
                  <td className="px-4 py-3 text-black/70">{company.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

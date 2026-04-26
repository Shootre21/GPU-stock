import Link from 'next/link';
import { addCompany } from '@/app/actions';
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

        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Add company</h2>
          <form action={addCompany} className="mt-4 grid gap-3 md:grid-cols-2">
            <input name="name" placeholder="Company name" className="rounded-xl border border-black/10 px-4 py-3" required />
            <select name="niche" className="rounded-xl border border-black/10 px-4 py-3" defaultValue="accounting">
              <option value="accounting">Accounting</option>
              <option value="insurance">Insurance</option>
              <option value="dental">Dental</option>
              <option value="law">Law</option>
              <option value="other">Other</option>
            </select>
            <input name="website" placeholder="https://example.com" className="rounded-xl border border-black/10 px-4 py-3" required />
            <input name="phone" placeholder="Phone" className="rounded-xl border border-black/10 px-4 py-3" />
            <input name="city" placeholder="City" className="rounded-xl border border-black/10 px-4 py-3" />
            <input name="notes" placeholder="Why this is a fit" className="rounded-xl border border-black/10 px-4 py-3 md:col-span-2" />
            <button className="rounded-xl bg-black px-4 py-3 text-white md:col-span-2">Save company</button>
          </form>
        </section>

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

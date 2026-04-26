import Link from 'next/link';
import { addTemplate } from '@/app/actions';
import { loadCRMData } from '@/lib/crm-data';

export default async function TemplatesPage() {
  const data = await loadCRMData();

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold">Templates</h1>
            <p className="mt-2 text-black/65">Niche-specific outreach templates for first-touch emails.</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to dashboard</Link>
        </div>

        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Add template</h2>
          <form action={addTemplate} className="mt-4 grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <input name="name" placeholder="Template name" className="rounded-xl border border-black/10 px-4 py-3" required />
              <select name="niche" className="rounded-xl border border-black/10 px-4 py-3" defaultValue="general">
                <option value="general">General</option>
                <option value="accounting">Accounting</option>
                <option value="insurance">Insurance</option>
                <option value="dental">Dental</option>
                <option value="law">Law</option>
                <option value="other">Other</option>
              </select>
            </div>
            <input name="subject" placeholder="Subject" className="rounded-xl border border-black/10 px-4 py-3" required />
            <textarea name="body" placeholder="Email body with placeholders like {{contactName}} and {{companyName}}" className="min-h-48 rounded-xl border border-black/10 px-4 py-3" required />
            <label className="flex items-center gap-2 text-sm text-black/70">
              <input type="checkbox" name="active" defaultChecked /> Active
            </label>
            <button className="rounded-xl bg-black px-4 py-3 text-white">Save template</button>
          </form>
        </section>

        <div className="grid gap-4">
          {data.templates.map((template) => (
            <div key={template.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{template.name}</h2>
                  <p className="mt-1 text-sm text-black/55">Niche: <span className="capitalize">{template.niche}</span></p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-medium ${template.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                  {template.active ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="mt-4 rounded-xl bg-black/[0.03] p-4 text-sm">
                <div><span className="font-medium">Subject:</span> {template.subject}</div>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-black/75">{template.body}</pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

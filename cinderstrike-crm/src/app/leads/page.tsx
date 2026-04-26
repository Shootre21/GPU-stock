import Link from 'next/link';
import { addLead, sendTemplateEmail } from '@/app/actions';
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

        <section className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Add lead</h2>
          <form action={addLead} className="mt-4 grid gap-3 md:grid-cols-2">
            <select name="companyId" className="rounded-xl border border-black/10 px-4 py-3" required defaultValue="">
              <option value="" disabled>Select company</option>
              {data.companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            <input name="contactName" placeholder="Contact name" className="rounded-xl border border-black/10 px-4 py-3" required />
            <input name="email" type="email" placeholder="name@company.com" className="rounded-xl border border-black/10 px-4 py-3" required />
            <input name="title" placeholder="Owner, office manager, etc." className="rounded-xl border border-black/10 px-4 py-3" />
            <select name="status" className="rounded-xl border border-black/10 px-4 py-3" defaultValue="new">
              <option value="new">new</option>
              <option value="queued">queued</option>
              <option value="sent">sent</option>
              <option value="replied">replied</option>
              <option value="bounced">bounced</option>
              <option value="not_interested">not_interested</option>
              <option value="do_not_contact">do_not_contact</option>
            </select>
            <input name="note" placeholder="Notes" className="rounded-xl border border-black/10 px-4 py-3" />
            <button className="rounded-xl bg-black px-4 py-3 text-white md:col-span-2">Save lead</button>
          </form>
        </section>

        <div className="space-y-4">
          {data.leads.length === 0 ? (
            <div className="rounded-2xl border border-black/10 bg-white p-6 text-black/55 shadow-sm">
              No leads yet — add real contact records next.
            </div>
          ) : (
            data.leads.map((lead) => {
              const company = companyMap.get(lead.companyId);
              const matchingTemplates = data.templates.filter(
                (template) => template.active && (template.niche === company?.niche || template.niche === 'general')
              );

              return (
                <div key={lead.id} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">{lead.contactName}</h2>
                      <p className="text-sm text-black/65">{company?.name || 'Unknown company'} • {lead.email}</p>
                      <p className="mt-1 text-sm text-black/55">Status: {lead.status}{lead.title ? ` • ${lead.title}` : ''}</p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-black/[0.03] p-4">
                    <div className="text-sm text-black/65">Send first-touch email</div>
                    <form action={sendTemplateEmail} className="mt-3 flex flex-col gap-3 md:flex-row">
                      <input type="hidden" name="leadId" value={lead.id} />
                      <select name="templateId" className="min-w-[280px] rounded-xl border border-black/10 px-4 py-3" defaultValue={matchingTemplates[0]?.id || ''} required>
                        {matchingTemplates.length === 0 ? (
                          <option value="">No active template for this niche</option>
                        ) : (
                          matchingTemplates.map((template) => (
                            <option key={template.id} value={template.id}>{template.name}</option>
                          ))
                        )}
                      </select>
                      <button
                        disabled={matchingTemplates.length === 0 || lead.status === 'do_not_contact'}
                        className="rounded-xl bg-blue-600 px-4 py-3 text-white disabled:cursor-not-allowed disabled:bg-blue-300"
                      >
                        Send via Resend
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </main>
  );
}

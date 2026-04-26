import Link from 'next/link';
import { loadCRMData } from '@/lib/crm-data';

export default async function SendsPage() {
  const data = await loadCRMData();
  const leadMap = new Map(data.leads.map((lead) => [lead.id, lead]));
  const templateMap = new Map(data.templates.map((template) => [template.id, template]));

  return (
    <main className="min-h-screen bg-[#f6f7fb] p-8 text-black">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold">Send Log</h1>
            <p className="mt-2 text-black/65">Track outbound emails, provider IDs, and status changes.</p>
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">Back to dashboard</Link>
        </div>

        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-black/[0.04] text-left">
              <tr>
                <th className="px-4 py-3">To</th>
                <th className="px-4 py-3">Lead</th>
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Provider ID</th>
                <th className="px-4 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.sends.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-black/55">
                    No emails sent yet.
                  </td>
                </tr>
              ) : (
                data.sends.map((send) => (
                  <tr key={send.id} className="border-t border-black/5 align-top">
                    <td className="px-4 py-3">{send.to}</td>
                    <td className="px-4 py-3">{leadMap.get(send.leadId)?.contactName || 'Unknown lead'}</td>
                    <td className="px-4 py-3">{templateMap.get(send.templateId)?.name || 'Unknown template'}</td>
                    <td className="px-4 py-3">{send.status}</td>
                    <td className="px-4 py-3 text-black/70">{send.providerMessageId || '—'}</td>
                    <td className="px-4 py-3 text-black/70">{new Date(send.createdAt).toLocaleString()}</td>
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

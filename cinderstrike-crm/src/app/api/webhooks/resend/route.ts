import { NextResponse } from 'next/server';
import { loadCRMData, saveCRMData } from '@/lib/crm-data';

function mapStatus(type: string) {
  switch (type) {
    case 'email.delivered':
      return 'delivered' as const;
    case 'email.bounced':
      return 'bounced' as const;
    default:
      return 'failed' as const;
  }
}

export async function POST(request: Request) {
  const payload = await request.json();
  const eventType = payload?.type;
  const emailId = payload?.data?.email_id || payload?.data?.id;

  if (!eventType || !emailId) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const data = await loadCRMData();
  const send = data.sends.find((item) => item.providerMessageId === emailId);
  if (!send) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  send.status = mapStatus(eventType);

  const lead = data.leads.find((item) => item.id === send.leadId);
  if (lead && send.status === 'bounced') {
    lead.status = 'bounced';
  }

  await saveCRMData(data);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import crypto from 'crypto';
import { isAuthorized } from '@/lib/auth';
import { loadCRMData, renderTemplate, saveCRMData } from '@/lib/crm-data';

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'hello@sh00tre.cc';
  if (!resendApiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY is not configured' }, { status: 500 });
  }

  const { leadId, templateId } = await request.json();
  if (!leadId || !templateId) {
    return NextResponse.json({ error: 'leadId and templateId are required' }, { status: 400 });
  }

  const data = await loadCRMData();
  const lead = data.leads.find((item) => item.id === leadId);
  const template = data.templates.find((item) => item.id === templateId);
  if (!lead || !template) {
    return NextResponse.json({ error: 'Lead or template not found' }, { status: 404 });
  }
  if (lead.status === 'do_not_contact') {
    return NextResponse.json({ error: 'Lead marked do not contact' }, { status: 400 });
  }

  const company = data.companies.find((item) => item.id === lead.companyId);
  const rendered = renderTemplate(template, lead, company);

  const resend = new Resend(resendApiKey);
  const result = await resend.emails.send({
    from: fromEmail,
    to: [lead.email],
    subject: rendered.subject,
    text: rendered.body,
  });

  data.sends.unshift({
    id: crypto.randomUUID(),
    leadId: lead.id,
    templateId: template.id,
    subject: rendered.subject,
    body: rendered.body,
    from: fromEmail,
    to: lead.email,
    provider: 'resend',
    providerMessageId: result.data?.id,
    status: result.error ? 'failed' : 'sent',
    createdAt: new Date().toISOString(),
  });

  lead.status = result.error ? 'queued' : 'sent';
  await saveCRMData(data);

  if (result.error) {
    return NextResponse.json({ error: result.error.message || 'Failed to send email' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.data?.id });
}

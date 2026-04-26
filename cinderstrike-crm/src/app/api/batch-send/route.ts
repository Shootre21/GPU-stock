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

  const body = await request.json();
  const templateId = String(body?.templateId || '');
  const leadIds = Array.isArray(body?.leadIds) ? body.leadIds.map(String) : [];

  if (!templateId || leadIds.length === 0) {
    return NextResponse.json({ error: 'templateId and leadIds are required' }, { status: 400 });
  }

  if (leadIds.length > 10) {
    return NextResponse.json({ error: 'Batch size limited to 10 leads per request' }, { status: 400 });
  }

  const data = await loadCRMData();
  const template = data.templates.find((item) => item.id === templateId);
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const resend = new Resend(resendApiKey);
  const results: Array<{ leadId: string; email: string; ok: boolean; id?: string; error?: string }> = [];

  for (const leadId of leadIds) {
    const lead = data.leads.find((item) => item.id === leadId);
    if (!lead || lead.status === 'do_not_contact') {
      results.push({ leadId, email: lead?.email || '', ok: false, error: 'Lead missing or do_not_contact' });
      continue;
    }

    const company = data.companies.find((item) => item.id === lead.companyId);
    const rendered = renderTemplate(template, lead, company);

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
    results.push({
      leadId: lead.id,
      email: lead.email,
      ok: !result.error,
      id: result.data?.id,
      error: result.error?.message,
    });
  }

  await saveCRMData(data);
  return NextResponse.json({ ok: true, results });
}

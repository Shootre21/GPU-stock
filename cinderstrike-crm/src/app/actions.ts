'use server';

import crypto from 'crypto';
import { Resend } from 'resend';
import { loadCRMData, renderTemplate, saveCRMData, type CompanyNiche, type LeadStatus } from '@/lib/crm-data';

function getString(formData: FormData, key: string) {
  return String(formData.get(key) || '').trim();
}

export async function addCompany(formData: FormData) {
  const data = await loadCRMData();
  data.companies.unshift({
    id: crypto.randomUUID(),
    name: getString(formData, 'name'),
    niche: (getString(formData, 'niche') || 'other') as CompanyNiche,
    website: getString(formData, 'website'),
    phone: getString(formData, 'phone') || undefined,
    city: getString(formData, 'city') || undefined,
    notes: getString(formData, 'notes') || undefined,
    createdAt: new Date().toISOString(),
  });
  await saveCRMData(data);
}

export async function addLead(formData: FormData) {
  const data = await loadCRMData();
  data.leads.unshift({
    id: crypto.randomUUID(),
    companyId: getString(formData, 'companyId'),
    contactName: getString(formData, 'contactName'),
    email: getString(formData, 'email'),
    title: getString(formData, 'title') || undefined,
    status: (getString(formData, 'status') || 'new') as LeadStatus,
    note: getString(formData, 'note') || undefined,
    createdAt: new Date().toISOString(),
  });
  await saveCRMData(data);
}

export async function addTemplate(formData: FormData) {
  const data = await loadCRMData();
  data.templates.unshift({
    id: crypto.randomUUID(),
    name: getString(formData, 'name'),
    niche: (getString(formData, 'niche') || 'general') as CompanyNiche | 'general',
    subject: getString(formData, 'subject'),
    body: getString(formData, 'body'),
    active: formData.get('active') === 'on',
    createdAt: new Date().toISOString(),
  });
  await saveCRMData(data);
}

export async function sendTemplateEmail(formData: FormData) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'hello@sh00tre.cc';
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured.');
  }

  const leadId = getString(formData, 'leadId');
  const templateId = getString(formData, 'templateId');

  const data = await loadCRMData();
  const lead = data.leads.find((item) => item.id === leadId);
  const template = data.templates.find((item) => item.id === templateId);
  if (!lead) throw new Error('Lead not found.');
  if (!template) throw new Error('Template not found.');
  if (lead.status === 'do_not_contact') {
    throw new Error('Lead is marked do not contact.');
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
    throw new Error(result.error.message || 'Failed to send email.');
  }
}

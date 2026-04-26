import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export type CompanyNiche = 'accounting' | 'insurance' | 'dental' | 'law' | 'other';
export type LeadStatus = 'new' | 'queued' | 'sent' | 'replied' | 'bounced' | 'not_interested' | 'do_not_contact';
export type SendStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed';

export interface Company {
  id: string;
  name: string;
  niche: CompanyNiche;
  website: string;
  phone?: string;
  city?: string;
  notes?: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  companyId: string;
  contactName: string;
  email: string;
  title?: string;
  status: LeadStatus;
  note?: string;
  createdAt: string;
}

export interface Template {
  id: string;
  name: string;
  niche: CompanyNiche | 'general';
  subject: string;
  body: string;
  active: boolean;
  createdAt: string;
}

export interface SendLog {
  id: string;
  leadId: string;
  templateId: string;
  subject: string;
  body: string;
  from: string;
  to: string;
  provider: 'resend';
  providerMessageId?: string;
  status: SendStatus;
  createdAt: string;
}

export interface CRMData {
  companies: Company[];
  leads: Lead[];
  templates: Template[];
  sends: SendLog[];
}

const dataDir = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDir, 'crm.json');

const seedData: CRMData = {
  companies: [
    {
      id: crypto.randomUUID(),
      name: 'Accuity, LLC',
      niche: 'accounting',
      website: 'https://www.accuitycpas.com/',
      phone: '(541) 223-5555',
      city: 'Albany, OR',
      notes: 'CPA/accounting firm in Albany. Strong fit for low-cost security checkup.',
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: 'Suzanne Bodlovic State Farm',
      niche: 'insurance',
      website: 'https://insurewithsuzanne.com/',
      phone: '(541) 926-5501',
      city: 'Albany, OR',
      notes: 'Insurance office with client PII and email workflow exposure.',
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: 'West Albany Dental',
      niche: 'dental',
      website: 'https://www.westalbanydental.com/',
      phone: '(541) 928-6650',
      city: 'Albany, OR',
      notes: 'Dental office; likely fit for practical account and email security review.',
      createdAt: new Date().toISOString(),
    },
  ],
  leads: [],
  templates: [
    {
      id: crypto.randomUUID(),
      name: 'Accounting security checkup intro',
      niche: 'accounting',
      subject: 'Quick cybersecurity idea for {{companyName}}',
      body: `Hi {{contactName}},\n\nI help small businesses reduce email and account compromise risk without turning it into a giant IT project. I thought {{companyName}} might be a good fit for a flat-rate small business security checkup focused on MFA, email security, admin access, and recovery readiness.\n\nIf useful, I can send over a quick outline of what that checkup would cover.\n\n— Nathan\nCinderstrike\nhttps://cinderstrike.vercel.app`,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: 'Insurance office security checkup intro',
      niche: 'insurance',
      subject: 'Practical security help for {{companyName}}',
      body: `Hi {{contactName}},\n\nI work with small offices on practical cybersecurity improvements — the kind that reduce email/account compromise risk without enterprise overhead. Offices handling client data often benefit from a simple review of MFA, account hygiene, admin access, and backup readiness.\n\nIf useful, I can send a quick outline of a flat-rate security checkup for {{companyName}}.\n\n— Nathan\nCinderstrike\nhttps://cinderstrike.vercel.app`,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: 'Dental office security checkup intro',
      niche: 'dental',
      subject: 'Small office security checkup for {{companyName}}',
      body: `Hi {{contactName}},\n\nI help small businesses tighten the easy things attackers tend to exploit first: email accounts, MFA, admin access, and recovery readiness. For smaller offices, that usually means practical improvements without a huge IT bill.\n\nIf useful, I can send over a quick outline of a flat-rate security checkup for {{companyName}}.\n\n— Nathan\nCinderstrike\nhttps://cinderstrike.vercel.app`,
      active: true,
      createdAt: new Date().toISOString(),
    },
  ],
  sends: [],
};

export async function ensureCRMData() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seedData, null, 2), 'utf8');
  }
}

export async function loadCRMData(): Promise<CRMData> {
  await ensureCRMData();
  const raw = await fs.readFile(dataFile, 'utf8');
  return JSON.parse(raw) as CRMData;
}

export async function saveCRMData(data: CRMData) {
  await ensureCRMData();
  await fs.writeFile(dataFile, JSON.stringify(data, null, 2), 'utf8');
}

export function renderTemplate(template: Template, lead: Lead, company?: Company) {
  const replacements: Record<string, string> = {
    contactName: lead.contactName || 'there',
    companyName: company?.name || 'your business',
    email: lead.email,
  };

  const apply = (input: string) =>
    input.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => replacements[key] || '');

  return {
    subject: apply(template.subject),
    body: apply(template.body),
  };
}

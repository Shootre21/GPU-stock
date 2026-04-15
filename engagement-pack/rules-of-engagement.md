# Rules of Engagement (ROE)

## Engagement Summary
- **Client:** Craigslist, Inc.
- **Security Provider:** Cybershield Security Solutions
- **Engagement Type:** White-box penetration test
- **Engagement Window:** April 1, 2026 – April 29, 2026
- **Testing Hours:** Weekdays, 9:00 AM – 11:00 PM PST

## In Scope
- `craigslist.org`
- Public-facing APIs and endpoints
- Official mobile applications (iOS and Android)
- Public-facing infrastructure components specifically approved by Client
- Third-party integrations with separate explicit authorization where required

## Out of Scope
- Internal corporate networks
- Employee systems and accounts
- Development and staging environments (unless separately approved)
- Third-party vendors without separate authorization
- Physical security testing
- Social engineering

## Prohibited Activities
- Denial-of-service
- Destructive testing
- Excessive automated testing likely to affect service quality
- Credential testing against real user accounts unless separately approved
- Data exfiltration beyond minimal proof-of-concept evidence

## Safety Guardrails
- Respect rate limits
- Stop immediately if availability or integrity risk is observed
- Escalate critical findings within 24 hours
- Log all actions with timestamps, tool names, command flags, and summarized outputs

## Escalation Contacts
- **Client primary contact:** __________________
- **Client emergency contact:** __________________
- **Testing pause/stop channel:** __________________

## Evidence Handling
- Store only minimum necessary proof
- Redact PII and secrets whenever possible
- Destroy retained data at engagement close, per agreement

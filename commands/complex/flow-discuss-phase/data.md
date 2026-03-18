---
description: Data/Content question branch for discuss-phase
---

# Data/Content Questions

Explore these areas. Not all will apply — use judgement.

## Schema & Structure
- What entities/models are involved in this phase?
- What are the relationships between them?
- Any fields that need special handling? (enums, JSON blobs, computed fields)
- Any schema migrations required from existing data?

## Validation
- What validation rules apply to inputs?
- Server-side only, or client + server?
- Any cross-field validation? (e.g. end date must be after start date)
- How strict? (reject invalid, or sanitise and accept?)

## Content
- Is any content user-generated or admin-controlled?
- Any rich text, markdown, or HTML content involved?
- Internationalisation or localisation needed?

## Data Lifecycle
- How long is data retained?
- Any soft delete vs hard delete preference?
- Any archiving or audit trail requirements?

## Seeding & Test Data
- Does this phase need seed data to be testable?
- Any specific test scenarios that need representative data?

## Privacy & Compliance
- Any PII (personally identifiable information) in this data?
- Any regulatory requirements? (GDPR, HIPAA, etc.)
- Any data that must never be logged or stored in plaintext?

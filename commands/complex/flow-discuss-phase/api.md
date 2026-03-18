---
description: API/Backend question branch for discuss-phase
---

# API/Backend Questions

Explore these areas. Not all will apply — use judgement.

## Endpoints & Contract
- What endpoints does this phase need to expose?
- What should the request/response shape look like?
- REST, GraphQL, RPC, or no preference?
- Any versioning requirements?

## Data Flow
- Where does data come from? (user input, database, external API, computed)
- What transformations happen between input and storage/response?
- Any caching requirements?

## Authentication & Authorisation
- Which endpoints are public vs protected?
- Role-based access? (if so, which roles apply here)
- How should unauthorised requests be handled?

## Error Handling
- What HTTP status codes matter for this phase?
- Should errors be verbose (dev) or opaque (prod)?
- Any specific error response format the frontend expects?

## Performance & Limits
- Any rate limiting needed?
- Expected request volume (affects design decisions)?
- Any timeout constraints?

## External Integrations
- Any third-party APIs called in this phase?
- Any webhooks received or sent?
- Any queue or async processing involved?

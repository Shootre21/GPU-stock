---
name: modular-coding-architect
description: Improve non-monolithic software structure. Use when the user asks for cleaner architecture, modularization, separation of concerns, layered design, plugin systems, reusable components, service boundaries, or refactors away from a giant single file or tightly coupled codebase.
---

# modular-coding-architect

Use this skill when code should become more modular, testable, and maintainable.

## Core rules

- Split by responsibility, not by vibes.
- Prefer clear boundaries: domain, application, infrastructure, interface.
- Keep I/O at edges and logic in reusable modules.
- Minimize global state.
- Introduce interfaces only when they reduce coupling or enable testing.

## Refactor checklist

1. Identify current monolith boundaries.
   - giant files
   - mixed UI/business logic/data access
   - circular dependencies
   - hidden side effects

2. Extract modules in this order.
   - pure utilities
   - domain logic
   - data/service adapters
   - transport/UI handlers

3. Preserve behavior while moving code.
   - move first
   - rename second
   - optimize last

4. Add lightweight validation.
   - smoke tests
   - type checks
   - one path end-to-end check

## Preferred outcomes

- Smaller files with obvious purpose.
- Dependency direction flows inward.
- A new feature can be added without editing unrelated modules.
- Swapping storage, transport, or model provider is localized.

## Smells that justify using this skill

- one 1000+ line file
- handlers doing DB + formatting + business logic
- repeated copy-paste branches
- impossible-to-test code because everything touches everything

## Deliverables

- Proposed target module tree
- Incremental refactor plan
- Actual extracted modules when asked to implement

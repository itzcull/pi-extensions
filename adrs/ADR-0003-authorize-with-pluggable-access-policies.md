# ADR-0003: Authorize Messages with Pluggable Access Policies

## Status

Accepted

## Metadata

- Date: 2026-09-06
- Decider: itzcull
- Confidence: High
- Related: [ADR-0002](./ADR-0002-map-platform-conversations-to-pi-sessions.md)

## Context

A gateway user can indirectly invoke a Pi agent with access to local credentials, files, tools, and processes. Platform transport authentication proves where an event came from, but it does not establish that its sender may use the local Pi host.

The gateway must support Telegram, Slack, Discord, and user-defined channels without embedding every organization's authorization rules in the transport implementations.

## Decision Drivers

- Deny unauthorized remote access to the Pi host.
- Fail closed when configuration or policy evaluation fails.
- Apply one authorization model to built-in and custom channels.
- Keep transport authentication separate from application authorization.
- Permit organization-specific policy without changing gateway core.

## Considered Options

| Option                                          | Benefits                                               | Drawbacks                                                    |
| ----------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Trust every event delivered by the platform     | Minimal configuration                                  | Bot exposure or token leakage grants remote Pi access        |
| Allowlist conversations                         | Simple and aligned with conversation routing           | Every participant in an allowed group gains access           |
| Allowlist senders                               | Strong individual authorization                        | Authorized users may invoke Pi from unintended conversations |
| Require both sender and conversation allowlists | Predictable and restrictive                            | Cannot express richer deployment-specific policy             |
| Invoke an explicit pluggable access policy      | Supports normalized built-ins and custom authorization | Adds a public policy contract that must remain compatible    |

## Decision

The gateway will require an explicit access policy that evaluates normalized sender and conversation identities before a message reaches Pi.

Missing policies, policy errors, and indeterminate results will deny access. The core package will provide secure policy building blocks for deny-all and allowlist behavior. Unrestricted access will require an explicit opt-in. Platform channels remain responsible for authenticating platform events; the gateway core remains responsible for authorization.

## Consequences

Positive:

- Access control applies consistently across all channel implementations.
- Deployments can express sender, conversation, or combined constraints.
- Custom channels do not need to duplicate gateway authorization logic.
- No permissive behavior occurs accidentally.

Negative:

- Every deployment must configure or supply a policy before accepting messages.
- Policy authors can still grant excessive access through incorrect logic.
- Normalized identity contracts become security-sensitive public API.

Neutral:

- Interactive pairing is not part of the initial authorization mechanism.
- Platform-native roles may be consumed by custom policies but are not themselves sufficient authorization.

## Confirmation

- Startup or message handling fails closed when no valid policy is present.
- Contract tests prove denied messages never reach a Pi session.
- Policy exceptions and unknown identities are treated as denials.
- Built-in and custom channels pass through the same authorization boundary.

## Reevaluation Triggers

- Users require interactive pairing or approval workflows.
- Platform-native role authorization becomes a common requirement.
- Policy configuration errors become a significant operational burden.
- Authorization needs move to a separate identity service.

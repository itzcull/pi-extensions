# ADR-0002: Map Each Platform Conversation to a Pi Session

## Status

Accepted

## Metadata

- Date: 2026-09-06
- Decider: itzcull
- Confidence: High
- Related: [ADR-0001](./ADR-0001-run-as-standalone-sdk-host.md)

## Context

The gateway will receive messages from Telegram, Slack, Discord, and user-defined channels. It needs a deterministic boundary for conversational history so unrelated chats do not share Pi context while participants in one messaging conversation can continue a coherent exchange.

Platforms identify conversations differently and may add threads or topics beneath a channel or chat.

## Decision Drivers

- Prevent context leakage across unrelated conversations.
- Preserve the conversational model users already understand on each platform.
- Support group conversations without splitting context by participant.
- Restore the same Pi conversation after process restarts.
- Keep session routing deterministic across channel implementations.

## Considered Options

| Option                                     | Benefits                                                        | Drawbacks                                                         |
| ------------------------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| One global session                         | Minimal routing and storage                                     | Leaks context and creates interference across users and platforms |
| One session per platform conversation      | Preserves group context while isolating unrelated conversations | Requires durable mapping and normalized conversation identities   |
| One session per user                       | Preserves individual continuity                                 | Mixes unrelated channels and breaks shared group context          |
| One session per user within a conversation | Strong participant isolation                                    | Prevents participants from sharing one coherent conversation      |
| Configurable mapping strategies            | Supports varied use cases                                       | Expands the initial public API and migration surface              |

## Decision

The gateway will maintain one persistent Pi session for each normalized platform conversation.

A conversation identity will include the channel implementation, platform account or installation, conversation identifier, and a thread or topic identifier when the platform provides one. Direct messages are conversations under the same rule.

## Consequences

Positive:

- Unrelated conversations do not share Pi history.
- Participants in the same group conversation share context.
- Platform threads and topics can progress independently.

Negative:

- The gateway must persist and restore conversation-to-session mappings.
- Platform adapters must provide stable normalized conversation identities.
- Renamed, migrated, or deleted platform conversations may leave orphaned Pi sessions.

Neutral:

- All participants in an authorized group conversation can influence its shared Pi context.
- Cross-platform conversation linking is not provided by this mapping.

## Confirmation

- Repeated messages for the same normalized conversation reach the same persistent Pi session.
- Messages from different conversation identities reach different sessions.
- Restart tests verify that a conversation resumes its previous session.
- Thread or topic identifiers produce distinct sessions when present.

## Reevaluation Triggers

- Users need one conversation to span multiple platforms.
- A platform cannot provide stable conversation identifiers.
- A concrete use case requires user-isolated context within a shared channel.
- The number of persisted sessions creates an operational retention problem.

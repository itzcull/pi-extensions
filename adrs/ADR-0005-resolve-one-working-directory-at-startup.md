# ADR-0005: Resolve One Working Directory at Gateway Startup

## Status

Accepted

## Metadata

- Date: 2026-09-06
- Decider: itzcull
- Confidence: High
- Related: [ADR-0002](./ADR-0002-map-platform-conversations-to-pi-sessions.md), [ADR-0004](./ADR-0004-inherit-active-pi-profile-settings.md)

## Context

Every gateway-created Pi session needs a working directory for tool execution, project settings, context files, and project resources. Local terminal use naturally has a current directory, while process supervisors often require an explicit path.

Allowing a remote conversation to choose its own directory would combine project routing with authorization and substantially increase the security surface.

## Decision Drivers

- Match Pi's familiar current-directory behavior for local use.
- Provide deterministic configuration for supervised deployments.
- Keep all sessions in one gateway process within one project boundary.
- Prevent remote messages from selecting arbitrary local directories.
- Preserve Pi's profile-and-project settings merge behavior.

## Considered Options

| Option                                                     | Benefits                                     | Drawbacks                                                 |
| ---------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- |
| Always use the launch directory                            | Familiar and requires no flags               | Service managers may supply an unintended directory       |
| Require a `--cwd` argument                                 | Explicit and predictable                     | Adds friction to ordinary terminal use                    |
| Require a gateway configuration value                      | Stable for daemon deployment                 | Couples configuration to machine-specific paths           |
| Resolve a directory per conversation                       | Supports multiple projects in one process    | Expands routing complexity and risks cross-project access |
| Use the launch directory with an optional `--cwd` override | Supports both local and supervised operation | Operators must still verify the resolved path             |

## Decision

The gateway will resolve one absolute working directory when it starts. It will use the process working directory by default and accept an optional `--cwd` override.

Every Pi session owned by that gateway process will use the resolved directory. Messaging users and channel implementations will not change it at runtime.

## Consequences

Positive:

- Local invocation behaves like Pi launched from a project directory.
- Services can select an explicit project path.
- All conversations in one process share a clear filesystem boundary.
- Pi can merge active-profile and selected-project settings consistently.

Negative:

- Serving multiple projects requires multiple gateway processes.
- A mistakenly configured service directory applies to every conversation.
- Changing projects requires restarting or launching another gateway.

Neutral:

- Conversation sessions remain distinct even though their working directory is shared.
- The path is resolved once rather than reinterpreted for each message.

## Confirmation

- Starting without `--cwd` uses the absolute launch directory.
- Starting with `--cwd` uses the absolute resolved override.
- Every created Pi session receives the same resolved directory.
- Invalid or inaccessible directories fail before messaging channels begin accepting traffic.

## Reevaluation Triggers

- A demonstrated use case requires one gateway process to serve multiple projects.
- Operational constraints make one process per project impractical.
- Strong sandboxing permits safe per-conversation project selection.

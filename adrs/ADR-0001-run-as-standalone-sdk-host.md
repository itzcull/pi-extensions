# ADR-0001: Run the Gateway as a Standalone Pi SDK Host

## Status

Accepted

## Metadata

- Date: 2026-09-06
- Decider: itzcull
- Confidence: High
- Related: [Pi SDK documentation](https://pi.dev/docs/latest/sdk)

## Context

`@itzcull/pi-gateway` must connect long-lived messaging channels to Pi Agent. The gateway must receive messages when no interactive Pi terminal is active and must manage conversations independently of a TUI session.

Pi supports attaching behavior to an existing process as an extension, embedding `AgentSession` through its TypeScript SDK, or controlling a separate Pi process through RPC.

## Decision Drivers

- Operate as an always-on messaging gateway.
- Manage multiple Pi conversations from one host process.
- Use Pi's typed Node.js APIs directly.
- Avoid coupling availability to an interactive terminal session.
- Avoid subprocess protocol complexity without a demonstrated isolation requirement.

## Considered Options

| Option                              | Benefits                                                                | Drawbacks                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Attached Pi extension               | Uses the current Pi session and conventional extension lifecycle        | Requires a running Pi process and couples remote traffic to its active session |
| Standalone host using the Pi SDK    | Supports long-lived operation, direct typed APIs, and multiple sessions | Must own session lifecycle, shutdown, and transport supervision                |
| Gateway controlling `pi --mode rpc` | Provides process isolation and a language-neutral boundary              | Adds subprocess supervision and JSONL protocol complexity                      |

## Decision

`@itzcull/pi-gateway` will run as a standalone host that embeds Pi through `@earendil-works/pi-coding-agent` SDK APIs.

The gateway will own messaging-channel and Pi-session lifecycles. It will not require an interactive Pi instance and will not use RPC subprocesses for its primary integration.

## Consequences

Positive:

- Messaging channels can remain available independently of a TUI.
- The gateway can manage multiple `AgentSession` instances directly.
- TypeScript types define the Pi integration boundary.

Negative:

- The gateway must implement graceful startup, shutdown, session restoration, and failure handling.
- SDK compatibility becomes part of the package's maintenance burden.
- Process isolation from Pi is not provided by default.

Neutral:

- The package is a Pi SDK integration rather than an extension attached to an existing session.
- Distribution and startup configuration remain separate decisions.

## Confirmation

- The executable starts without an interactive Pi process.
- Tests exercise the gateway through an owned Pi-session port or SDK-backed adapter.
- The implementation does not spawn `pi --mode rpc` for normal operation.

## Reevaluation Triggers

- Pi SDK compatibility proves less stable than the RPC protocol.
- Process isolation becomes a security or reliability requirement.
- A use case requires controlling an already-running interactive Pi session.

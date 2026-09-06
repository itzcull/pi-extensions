# ADR-0004: Inherit the Active Pi Profile's Settings

## Status

Accepted

## Metadata

- Date: 2026-09-06
- Decider: itzcull
- Confidence: High
- Related: [ADR-0001](./ADR-0001-run-as-standalone-sdk-host.md), [Pi settings documentation](https://pi.dev/docs/latest/settings)

## Context

A standalone gateway must configure Pi models, credentials, tools, resources, compaction, retries, and session behavior. Maintaining a second gateway-specific representation of those settings would duplicate Pi configuration and could behave differently from the user's normal Pi environment.

Pi's SDK resolves the active agent directory through `getAgentDir()`. `PI_CODING_AGENT_DIR` selects a non-default profile directory when present.

## Decision Drivers

- Preserve the user's established Pi behavior.
- Avoid duplicating model credentials and operational settings.
- Respect profile-specific tools, extensions, skills, prompts, and packages.
- Use Pi's authoritative configuration loading and merge semantics.
- Support both the default Pi directory and explicitly selected profiles.

## Considered Options

| Option                                        | Benefits                                                    | Drawbacks                                                    |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| Use Pi defaults without profile configuration | Predictable baseline                                        | Ignores the user's models, credentials, tools, and resources |
| Define separate gateway agent settings        | Allows gateway-specific restrictions                        | Duplicates Pi configuration and creates drift                |
| Require an explicit gateway tool allowlist    | Makes capabilities visible in gateway config                | Overrides the user's established Pi tool policy              |
| Inherit the active Pi profile                 | Reuses Pi's settings and credentials as the source of truth | Profile changes can alter gateway behavior and capabilities  |

## Decision

The gateway will create its Pi SDK services from the active Pi agent directory and inherited Pi settings.

It will use `getAgentDir()` so `PI_CODING_AGENT_DIR` selects the active profile and the standard Pi directory is used otherwise. Pi remains authoritative for model credentials, model selection, thinking level, default tools, extensions, skills, prompts, packages, compaction, retries, and related agent settings. Messaging transport and gateway access-policy configuration remain outside Pi's settings unless Pi later defines native settings for them.

## Consequences

Positive:

- Gateway sessions behave consistently with the selected Pi profile.
- Credentials and model configuration remain in Pi's existing stores.
- Profile switching requires no duplicated gateway agent configuration.

Negative:

- A profile change may grant or remove tools from remotely initiated sessions.
- Broken profile resources can prevent gateway sessions from starting.
- Gateway operation depends on Pi's settings compatibility and loading semantics.

Neutral:

- TUI-only settings may load but have no effect in the headless gateway.
- Project settings can still refine profile settings after a working directory is selected.

## Confirmation

- Tests select a temporary agent directory and verify that its model-independent settings reach created sessions.
- `PI_CODING_AGENT_DIR` changes the profile used by the gateway.
- The implementation uses Pi SDK settings, model, credential, and resource loaders rather than parallel parsers.
- Gateway documentation identifies the selected Pi profile as the authority for agent behavior.

## Reevaluation Triggers

- Remote sessions require stricter capabilities than interactive sessions.
- Pi profile loading introduces resources unsuitable for headless operation.
- Deployments require multiple Pi profiles within one gateway process.
- Pi adds a native gateway configuration domain.

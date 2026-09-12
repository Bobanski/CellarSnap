# CellarSnap working instructions

Read [CLAUDE.md](CLAUDE.md) for project conventions. For audit/remediation work, start with [docs/remediation/README.md](docs/remediation/README.md), then its linked current handover and canonical backlog. Do not rely on conversation history or an old audit's completion claims.

Record new findings in the canonical backlog with a stable ID, evidence, priority, batch, and acceptance criteria. Update existing IDs when symptoms share a root cause; preserve history when reopening or superseding findings. Do not silently add unrelated implementation work to an active batch.

Before ending a remediation batch or handing off a session, update finding statuses and publish a handover using the documented template. Distinguish implementation, QC, merge, deployment, and live verification. Include actual browser testing and available mobile-emulator testing in web-app QC, and explicitly record unavailable coverage.

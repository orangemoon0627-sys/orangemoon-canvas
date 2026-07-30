# Vibe Creative Blueprint

## Product Direction

The product keeps an editable infinite canvas underneath, while making the primary workflow goal-driven:

`intent -> plan -> review -> apply -> run -> monitor -> repair`

The interaction model may closely follow Updream and LiblibAI, but product branding, copy, visual assets, and implementation remain original. The target is behavioral and information-architecture parity, not a pixel-for-pixel clone.

## Baseline Decision

- New product base: upstream Infinite Canvas `v0.10.0`.
- Stable production runtime remains untouched at `/Users/fanhao/.local/share/infinite-canvas-runtime` until migration acceptance is complete.
- The old `v0.2.5` code is a behavior source only. It is not a merge base because the upstream architecture moved from Next.js plus Go to Vite plus a local Canvas Agent.
- The new worktree lives at `/Users/fanhao/Documents/绘画/infinite-canvas-vibe` on branch `codex/vibe-creative`.

## Experience Model

### Beginner Path

1. The user describes the desired result and may attach references.
2. The director reads the current canvas and available generation configuration.
3. It proposes a compact workflow with named outputs and dependencies.
4. The UI renders one human-readable review card for the complete batch.
5. Approval creates and connects all nodes in one operation.
6. The director runs only dependency-ready nodes, monitors task state, and repairs failed steps.

### Advanced Path

- Switch to direct node mode.
- Create, connect, resize, configure, and run individual nodes manually.
- Keep the same task status and recovery infrastructure as director mode.

## Agent Boundary

The UI sends an execution mode (`vibe` or `direct`) instead of assuming a specific model. The local Agent owns provider selection and model routing.

```ts
type AgentProvider = {
  id: string;
  startThread(input: AgentThreadInput): Promise<AgentThread>;
  runTurn(input: AgentTurnInput): AsyncIterable<AgentEvent>;
  interrupt(threadId: string): Promise<void>;
};
```

Codex remains the first adapter. A "5.6" model should be added as another adapter or configurable model profile after its exact API/model identifier is confirmed. It must not require UI rewrites or changes to AiMaMi proxy configuration.

## Migration Matrix

| Capability                                 | v0.10.0 base   | Migrate from current runtime          | Reimplement                     |
| ------------------------------------------ | -------------- | ------------------------------------- | ------------------------------- |
| Pan, zoom, selection, grouping, minimap    | Use directly   | No                                    | No                              |
| Left canvas and asset panel                | Use directly   | Asset data migration only             | Visual tuning                   |
| Hidden node titles and selected-node tools | Use directly   | No                                    | No                              |
| Plugin SDK and node registry               | Use directly   | Custom node definitions               | Provider-specific plugins       |
| Right Agent and canvas MCP tools           | Use directly   | Existing workflow rules               | Director protocol and review UI |
| Image2 generation                          | API shell only | Request mapping, references, recovery | v0.10 generation adapter        |
| Seedance / SD 2.0 video                    | API shell only | Request mapping, polling, recovery    | v0.10 generation adapter        |
| Task ownership and status query            | Use directly   | Resume edge cases                     | Cross-provider normalization    |
| Character, storyboard, scene gates         | No             | Existing validated rules              | Dependency scheduler            |
| Automatic failure repair                   | Partial        | Existing retry rules                  | Workflow-level repair policy    |

## Delivery Gates

1. UI shell and one-batch workflow review.
2. Provider-neutral Agent contract and exact "5.6" adapter.
3. Image2 and Seedance generation parity with the stable runtime.
4. Dependency-aware execution for character, storyboard, scene, and video outputs.
5. Data import and side-by-side acceptance tests.
6. Production switch only after rollback and task-resume tests pass.

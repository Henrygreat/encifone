# AI Architecture — EncifOne

## 1. Goals

- Provider-agnostic: no feature is hard-coupled to Anthropic, OpenAI, Gemini, or OpenRouter.
- Governed, not autonomous-by-default: every agent has an explicit autonomy level, tool allowlist, data-access scope, and spend limit.
- Explainable: outputs show sources, calculations, confidence, and explicitly flag missing information rather than inventing it.
- Safe against prompt injection and unauthorised tool execution by construction, not by prompt instruction alone.

## 2. AI Gateway (`ai-gateway` module)

Single internal interface used by every feature and agent:

```
interface AIGateway {
  complete(request: CompletionRequest): Promise<CompletionResult>
  stream(request: CompletionRequest): AsyncIterable<CompletionChunk>
  embed(input: string | string[]): Promise<number[][]>
}
```

Responsibilities:
- **Model routing** — select provider/model per request (configurable default + per-org override + per-agent override).
- **Fallback** — on provider error/timeout, retry against a configured fallback provider/model.
- **Structured output** — Zod-schema-validated JSON output mode, with provider-specific adapters (tool-call/function-call style for providers that support it; constrained prompting + validation + retry for those that don't).
- **Streaming** — normalised streaming interface regardless of provider, surfaced to the UI via SSE.
- **Token accounting & cost monitoring** — every call logs `AIUsage` (org, agent/feature, model, input/output tokens, computed cost) for billing and anomaly alerting.
- **Usage limits** — enforced before dispatch: org-level AI-credit entitlement and per-agent spend limit checked; request rejected (not silently downgraded) if exceeded, surfaced to the user/approval queue.

No application code calls a provider SDK directly outside this module.

## 3. Agent framework

Each `AIAgent` record configures:

- **Objective & instructions** — org-editable system prompt scoped to the agent's purpose.
- **Model** — which model/provider via the gateway.
- **Allowed tools** — explicit allowlist from the global tool registry (see §5); an agent cannot invoke a tool outside this list, enforced in the execution layer, not just omitted from its prompt.
- **Accessible data** — scope restrictions beyond the base org scope (e.g. "this client only," "read-only on Finance").
- **Schedule / trigger conditions** — cron-style schedule or event triggers (from `automation` module's event bus).
- **Approval requirement** — per action-type, not global; e.g. "draft replies: no approval, send: requires approval."
- **Spend limit** — hard cap enforced by the gateway before dispatch.
- **Autonomy level** (1–5, §4).
- **Execution/error history, success indicators, evaluation results** — stored on `AIAgentExecution`.
- **Pause / emergency stop** — immediate, org-admin-controllable, halts scheduled and in-flight triggering (in-flight calls complete or are cancelled where the provider supports cancellation).

## 4. Autonomy levels

| Level | Behaviour | Example |
|---|---|---|
| 1 — Read-only analysis | Agent reads data, produces no output artifact beyond an internal note/log | Daily anomaly scan with no user-visible action |
| 2 — Recommendations | Surfaces a recommendation to a human; takes no action | "Consider following up with Client X" |
| 3 — Draft actions | Produces a draft artifact (email, invoice, task) that a human must explicitly send/create | AI-drafted follow-up email sitting in Inbox as draft |
| 4 — Human-approved execution | Agent requests to execute; a human approves via the `AIApproval` queue; then it executes | Generate and send a renewal invoice, pending finance approval |
| 5 — Policy-restricted autonomous execution | Executes without per-instance approval, but only for narrowly-defined, explicitly authorised action types within hard limits (spend cap, action type allowlist, rate limit) | Auto-assign an incoming ticket to the correct queue based on category |

Financial transactions, destructive changes, legal commitments, and sensitive external communications are never configurable above level 4 except for a narrowly-scoped, explicitly authorised level-5 policy (e.g. "auto-send a satisfaction survey," never "auto-send an invoice for an amount the client hasn't agreed to").

## 5. Tool registry & permissions

- Tools are typed, permission-checked service functions (e.g. `createDraftInvoice`, `getClientProfitability`, `searchKnowledgeBase`, `createTask`) — never raw SQL, never unrestricted ORM access, never arbitrary HTTP requests.
- `AIToolPermission` maps agent → allowed tool names; the execution runtime rejects any tool call not on that list before it runs, independent of what the model "decided" to call.
- Tools that mutate state return a structured result including what changed, for audit logging and for the UI to render "what the AI did."

## 6. Retrieval-Augmented Generation (RAG)

- Knowledge base content is chunked and embedded (`pgvector`) per org; retrieval queries always filter by `organisationId`.
- Answers must cite the `KnowledgeArticle`/source record(s) used; if retrieval returns nothing relevant above a confidence threshold, the system returns an explicit "insufficient information" response rather than letting the model answer from parametric knowledge alone for business-fact questions.
- All ingested content — uploaded documents, inbound email, scraped web content — is treated as **untrusted data** for prompt-construction purposes: it is inserted into a clearly delimited "retrieved content" section of the prompt, and the system instructions explicitly state that instructions appearing inside retrieved content must be ignored. This is the primary prompt-injection defence, backed by the tool-allowlist control in §5 (so even a successful injection cannot escalate to unauthorised tool use).

## 7. AI Command Centre

- Natural-language query interface over the same typed tool registry used by agents — not a separate, less-governed code path.
- Every answer surfaces: the tools/queries used, the underlying figures, and any proposed action as a draft requiring the standard approval flow (§4) before execution.
- Global search and "ask a question" both route through permission checks for the asking user's role — the Command Centre cannot surface data the user couldn't otherwise see.

## 8. Explainability requirements (apply across all AI features)

- Lead scoring, health scores, leakage/scope-creep findings, and churn-risk labels must show the factors/weights and evidence used, not just a final number/label.
- Any statement about a client fact must trace to a source record and timestamp (`ClientMemory.source`, `confidenceLevel`).
- Missing or insufficient data is reported as such — the system does not interpolate plausible-sounding but fabricated figures.

## 9. Forecasting & BI model policy

- Default to transparent statistical methods (moving averages, weighted pipeline forecasting, simple regression) given typically small per-tenant datasets.
- Introduce ML-based forecasting only where there's sufficient historical data per org, and only after offline evaluation against held-out data; every forecast UI labels it as a projection with stated assumptions and confidence range, visually distinct from actuals.

## 10. Data sent to model providers

- Minimise PII in prompts: pass only the fields needed for the task; avoid sending full payment details or unnecessary sensitive personal data.
- Each supported provider's data-handling terms are reviewed before enabling it for a given org (documented per-provider, not assumed uniform); org admins can restrict which providers may be used for their org's data (relevant for regulated customers).

## 11. Evaluation & monitoring

- Each agent has defined success indicators (e.g. draft-acceptance rate, approval rate, error rate) tracked over time; `AIAgentExecution` history feeds this.
- Anomalous cost or error-rate spikes trigger an alert and, above a configured threshold, an automatic pause pending review.

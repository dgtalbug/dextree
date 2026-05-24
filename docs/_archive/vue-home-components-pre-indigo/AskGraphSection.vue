<!--
  Section: "Ask the graph."
  Skeleton — a stubbed playground panel showing a sample query + result.
  Real interactive query execution is a future enrichment.
-->
<script setup lang="ts">
const sampleQuery = `MATCH (s:Symbol)-[:CALLS]->(t:Symbol)
WHERE t.visibility = 'public'
  AND s.diagnostic_count > 0
  AND s.test_coverage = 0
RETURN s.name, t.name, s.file
ORDER BY s.git_recency DESC
LIMIT 5;`;

const sampleResult = [
  { caller: "AuthHandler.verify", callee: "User.authenticate", file: "src/auth/handler.ts" },
  { caller: "PaymentFlow.charge", callee: "Stripe.checkout", file: "src/payments/flow.ts" },
  { caller: "OrderQueue.poll", callee: "Database.fetch", file: "src/queue/order.ts" },
  { caller: "MetricsPipe.send", callee: "Datadog.track", file: "src/obs/metrics.ts" },
  { caller: "Webhook.dispatch", callee: "Slack.post", file: "src/webhooks/dispatch.ts" },
];
</script>

<template>
  <section id="playground" class="dx-section">
    <div class="dx-home__shell">
      <div class="dx-section__heading">
        <p class="dx-section__eyebrow">query layer</p>
        <h2 class="dx-display">Ask the <em>graph.</em></h2>
        <p class="dx-section__lede">
          DuckPGQ exposes your codebase as ISO SQL:2023 property graph queries.
          Combine call edges with diagnostics, git recency, and test coverage —
          all in one statement.
        </p>
      </div>

      <div class="dx-playground">
        <div class="dx-playground__panel">
          <div class="dx-playground__panel-head">
            <span class="dx-playground__panel-label">query</span>
            <span class="dx-playground__panel-hint">DuckPGQ · ISO SQL:2023</span>
          </div>
          <pre class="dx-playground__code">{{ sampleQuery }}</pre>
        </div>

        <div class="dx-playground__panel">
          <div class="dx-playground__panel-head">
            <span class="dx-playground__panel-label">result</span>
            <span class="dx-playground__panel-hint">{{ sampleResult.length }} rows · 4ms</span>
          </div>
          <table class="dx-playground__table">
            <thead>
              <tr>
                <th>caller</th>
                <th>callee</th>
                <th>file</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in sampleResult" :key="row.caller">
                <td>{{ row.caller }}</td>
                <td>{{ row.callee }}</td>
                <td>{{ row.file }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.dx-playground {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 880px) {
  .dx-playground {
    grid-template-columns: 1fr;
  }
}

.dx-playground__panel {
  background: var(--bg-2);
  border: 1px solid var(--line);
  border-radius: var(--r-5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dx-playground__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--bg-3);
  font-family: var(--mono);
  font-size: 11.5px;
}

.dx-playground__panel-label {
  color: var(--ink);
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.dx-playground__panel-hint {
  color: var(--ink-faint);
}

.dx-playground__code {
  margin: 0;
  padding: 16px;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--ink-warm);
  overflow-x: auto;
  background: var(--bg-2);
}

.dx-playground__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--mono);
  font-size: 12px;
}

.dx-playground__table th,
.dx-playground__table td {
  padding: 8px 16px;
  text-align: left;
  border-bottom: 1px solid var(--line);
  color: var(--ink-warm);
}

.dx-playground__table thead th {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-faint);
  font-weight: 500;
  background: var(--bg-3);
}

.dx-playground__table tbody tr:last-child td {
  border-bottom: 0;
}
</style>

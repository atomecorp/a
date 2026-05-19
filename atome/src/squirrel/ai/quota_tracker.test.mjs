import assert from 'node:assert/strict';

import { createAiQuotaTracker } from './quota_tracker.js';

const tracker = createAiQuotaTracker();

tracker.setBudgetTokensPerDay(100);
tracker.recordUsage({
    provider: 'openai',
    model: 'gpt-4o-mini',
    prompt_tokens: 45,
    completion_tokens: 40
});

let summary = tracker.getSummary();
assert.equal(summary.total_tokens, 85, 'quota tracker should aggregate token usage');
assert.equal(summary.warning_code, 'quota_running_low', 'quota tracker should warn when usage approaches the daily budget');

tracker.recordIncident({
    provider: 'openai',
    model: 'gpt-4o-mini',
    error_code: 'provider_quota_exceeded'
});

summary = tracker.getSummary();
assert.equal(summary.warning_code, 'provider_quota_exceeded', 'quota incidents should take precedence over soft budget warnings');

console.log('quota_tracker.test: PASS');

#!/usr/bin/env node
/**
 * CLI runner for the Unified API Test Suite
 * Run with: node run-api-tests.js
 */

import { runAllTests } from './api-test-suite.js';

console.log('🚀 Starting Unified API Test Suite...\n');

runAllTests()
    .then(results => {
        console.log('\n📋 Test run complete.');
        process.exit(results.failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('❌ Test suite crashed:', error.message);
        process.exit(1);
    });

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'agents', 'orchestrator.ps1'), 'utf8');

assert.match(source, /#Requires -Version 5\.1/);
assert.match(source, /\[switch\]\$DryRun/);
assert.match(source, /\[string\]\$Resume/);
assert.match(source, /--sandbox', 'workspace-write'/);
assert.match(source, /--ask-for-approval', 'never'/);
assert.match(source, /origin\/main\.\.\.HEAD/);
assert.match(source, /VERDICT\\s\*:\\s\*BLOCK/);
assert.match(source, /VERDICT\\s\*:\\s\*APPROVE/);
assert.match(source, /paused_gemini_quota_or_auth/);
assert.match(source, /ValidateRange\(0, 2\)/);
assert.match(source, /awaiting_human_merge/);
assert.doesNotMatch(source, /gh['"]?\s+pr['"]?\s+merge/i);
assert.doesNotMatch(source, /push[^\r\n]*--force/i);
assert.doesNotMatch(source, /reset\s+--hard/i);
assert.doesNotMatch(source, /worktree[^\r\n]*remove[^\r\n]*--force/i);
assert.match(source, /Potential credential files detected/);

console.log('PASS  coordinator v2 source safety, bounded retries and human merge boundary');

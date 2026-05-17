const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../lib/uiTopics');
const frontendPath = require('path').join(__dirname, '../../frontend/src/uiTopics.js');

describe('uiTopics', () => {
  it('exports expected topic paths for finance profile', () => {
    assert.equal(backend.catalogProfiles(), 'solace/catalog/profiles');
    assert.equal(backend.statsPublisher('finance'), 'solace/catalog/stats/finance/publisher');
    assert.equal(backend.events('finance'), 'solace/catalog/events/finance');
    assert.equal(backend.sessionSnapshot('sid-1'), 'solace/catalog/session/sid-1/snapshot');
    assert.equal(backend.sessionCommand('sid-1'), 'solace/catalog/session/sid-1/command');
    assert.equal(backend.commandsControl(), 'solace/catalog/commands/control');
    assert.equal(backend.commandsWildcard(), 'solace/catalog/commands/>');
  });

  it('frontend uiTopics.js mirrors backend strings', async () => {
    const frontend = await import(frontendPath);
    assert.equal(frontend.catalogProfiles(), backend.catalogProfiles());
    assert.equal(frontend.statsPublisher('retail'), backend.statsPublisher('retail'));
    assert.equal(frontend.events('retail'), backend.events('retail'));
    assert.equal(frontend.commandsControl(), backend.commandsControl());
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const backend = require('../lib/uiTopics');
const command = require('../lib/commandTopics');
const frontendPath = require('path').join(__dirname, '../../frontend/src/uiTopics.js');
const commandFrontendPath = require('path').join(__dirname, '../../frontend/src/commandTopics.js');

describe('uiTopics', () => {
  it('exports expected catalog topic paths', () => {
    assert.equal(backend.catalogProfiles(), 'solace/catalog/profiles');
    assert.equal(backend.statsPublisher('finance'), 'solace/catalog/stats/finance/publisher');
    assert.equal(backend.events('finance'), 'solace/catalog/events/finance');
    assert.equal(backend.sessionSnapshot('sid-1'), 'solace/catalog/session/sid-1/snapshot');
    assert.equal(backend.sessionWildcard(), 'solace/catalog/session/>');
  });

  it('command topics use solace/command root', () => {
    assert.equal(command.commandSession('sid-1'), 'solace/command/session/sid-1');
    assert.equal(command.commandWildcard(), 'solace/command/>');
  });

  it('frontend uiTopics.js mirrors backend strings', async () => {
    const frontend = await import(frontendPath);
    assert.equal(frontend.catalogProfiles(), backend.catalogProfiles());
    assert.equal(frontend.statsPublisher('retail'), backend.statsPublisher('retail'));
    assert.equal(frontend.events('retail'), backend.events('retail'));
    const commandFrontend = await import(commandFrontendPath);
    assert.equal(commandFrontend.commandSession('x'), command.commandSession('x'));
  });
});

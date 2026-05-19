const fs = require('fs');
const path = require('path');

const FIELD_TYPES = new Set([
  'enum',
  'int',
  'float',
  'partitionKey',
  'isoTimestamp',
  'id',
  'template',
]);

const FORMATS = new Set(['currency', 'number', 'text', 'badge']);
const PREDICTION_VALUE_FORMATS = new Set(['currency', 'number', 'decimal']);

const { resolvePlugin } = require('../prediction/registry');

function validateDemoProfile(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('Demo profile must be a non-null object');
  }

  if (profile.schemaVersion !== undefined && profile.schemaVersion !== 1) {
    throw new Error(`Unsupported schemaVersion: ${profile.schemaVersion} (only 1 is supported)`);
  }

  if (typeof profile.id !== 'string' || !profile.id.trim()) {
    throw new Error('Demo profile requires non-empty string: id');
  }

  if (!profile.branding || typeof profile.branding !== 'object') {
    throw new Error('Demo profile requires object: branding');
  }
  if (typeof profile.branding.appTitle !== 'string' || !profile.branding.appTitle.trim()) {
    throw new Error('Demo profile requires non-empty string: branding.appTitle');
  }

  if (!profile.messaging || typeof profile.messaging !== 'object') {
    throw new Error('Demo profile requires object: messaging');
  }
  const m = profile.messaging;
  if (typeof m.topicPrefix !== 'string' || !m.topicPrefix.trim()) {
    throw new Error('Demo profile requires non-empty string: messaging.topicPrefix');
  }
  if (!Array.isArray(m.partitionKeys) || m.partitionKeys.length === 0) {
    throw new Error('Demo profile requires non-empty array: messaging.partitionKeys');
  }
  const pkCount = m.partitionKeys.length;
  if (pkCount < 3 || pkCount > 16) {
    throw new Error(
      `Demo profile requires messaging.partitionKeys.length between 3 and 16 (got ${pkCount})`,
    );
  }
  if (!m.partitionKeys.every((k) => typeof k === 'string' && k.length > 0)) {
    throw new Error('messaging.partitionKeys must be an array of non-empty strings');
  }
  if (typeof m.partitionKeyField !== 'string' || !m.partitionKeyField.trim()) {
    throw new Error('Demo profile requires non-empty string: messaging.partitionKeyField');
  }
  if (typeof m.topicSuffixFromField !== 'string' || !m.topicSuffixFromField.trim()) {
    throw new Error('Demo profile requires non-empty string: messaging.topicSuffixFromField');
  }

  if (!Array.isArray(profile.messageFields) || profile.messageFields.length === 0) {
    throw new Error('Demo profile requires non-empty array: messageFields');
  }

  const fieldNames = new Set();
  for (const f of profile.messageFields) {
    if (!f || typeof f !== 'object') {
      throw new Error('Each messageFields entry must be an object');
    }
    if (typeof f.name !== 'string' || !f.name.trim()) {
      throw new Error('Each message field requires non-empty string: name');
    }
    if (fieldNames.has(f.name)) {
      throw new Error(`Duplicate message field name: ${f.name}`);
    }
    fieldNames.add(f.name);
    if (!FIELD_TYPES.has(f.type)) {
      throw new Error(
        `Unknown message field type "${f.type}" for field "${f.name}" (allowed: ${[...FIELD_TYPES].join(', ')})`,
      );
    }
    if (f.type === 'enum') {
      if (!Array.isArray(f.values) || f.values.length === 0) {
        throw new Error(`Field "${f.name}" (enum) requires non-empty values array`);
      }
    }
    if (f.type === 'int') {
      if (typeof f.min !== 'number' || typeof f.max !== 'number' || f.min > f.max) {
        throw new Error(`Field "${f.name}" (int) requires numeric min <= max`);
      }
    }
    if (f.type === 'float') {
      const hasRange = typeof f.min === 'number' && typeof f.max === 'number';
      const hasBaseline =
        f.baselineByPartitionKey &&
        typeof f.baselineByPartitionKey === 'object' &&
        Object.keys(f.baselineByPartitionKey).length > 0;
      if (!hasRange && !hasBaseline) {
        throw new Error(
          `Field "${f.name}" (float) requires either (min, max) or baselineByPartitionKey`,
        );
      }
      if (hasRange && f.min > f.max) {
        throw new Error(`Field "${f.name}" (float) requires min <= max`);
      }
      if (hasBaseline && typeof f.jitter !== 'number') {
        throw new Error(`Field "${f.name}" (float) with baselineByPartitionKey requires numeric jitter`);
      }
      if (f.volatilityByPartitionKey != null) {
        if (typeof f.volatilityByPartitionKey !== 'object') {
          throw new Error(`Field "${f.name}": volatilityByPartitionKey must be an object`);
        }
        for (const [, vv] of Object.entries(f.volatilityByPartitionKey)) {
          if (typeof vv !== 'number' || !(vv > 0)) {
            throw new Error(`Field "${f.name}": volatilityByPartitionKey values must be positive numbers`);
          }
        }
      }
    }
    if (f.type === 'id') {
      if (typeof f.prefix !== 'string') {
        throw new Error(`Field "${f.name}" (id) requires string prefix`);
      }
      if (typeof f.width !== 'number' || f.width < 1) {
        throw new Error(`Field "${f.name}" (id) requires positive integer width`);
      }
    }
    if (f.type === 'template') {
      if (typeof f.pattern !== 'string' || !f.pattern.includes('{n:')) {
        throw new Error(`Field "${f.name}" (template) requires pattern with {n:W} placeholder`);
      }
    }
  }

  if (!fieldNames.has(m.topicSuffixFromField)) {
    throw new Error(
      `messaging.topicSuffixFromField "${m.topicSuffixFromField}" must match a messageFields name`,
    );
  }
  if (!fieldNames.has(m.partitionKeyField)) {
    throw new Error(
      `messaging.partitionKeyField "${m.partitionKeyField}" must match a messageFields name`,
    );
  }

  const pkField = profile.messageFields.find((x) => x.name === m.partitionKeyField);
  if (!pkField || pkField.type !== 'partitionKey') {
    throw new Error(`Field "${m.partitionKeyField}" must have type "partitionKey"`);
  }

  if (!profile.ui || typeof profile.ui !== 'object') {
    throw new Error('Demo profile requires object: ui');
  }
  if (!Array.isArray(profile.ui.displayFields) || profile.ui.displayFields.length === 0) {
    throw new Error('Demo profile requires non-empty array: ui.displayFields');
  }
  for (const d of profile.ui.displayFields) {
    if (!d || typeof d !== 'object') {
      throw new Error('Each ui.displayFields entry must be an object');
    }
    if (typeof d.field !== 'string' || !d.field.trim()) {
      throw new Error('Each display field requires non-empty string: field');
    }
    if (typeof d.label !== 'string' || !d.label.trim()) {
      throw new Error('Each display field requires non-empty string: label');
    }
    if (!FORMATS.has(d.format)) {
      throw new Error(
        `Unknown format "${d.format}" for display field "${d.field}" (allowed: ${[...FORMATS].join(', ')})`,
      );
    }
    if (!fieldNames.has(d.field)) {
      throw new Error(`ui.displayFields references unknown message field: ${d.field}`);
    }
  }

  if (!profile.features || typeof profile.features !== 'object') {
    throw new Error('Demo profile requires object: features');
  }
  for (const k of Object.keys(profile.features)) {
    if (k !== 'prediction') {
      throw new Error(`Unknown features key: ${k} (only prediction is supported)`);
    }
  }
  const pred = profile.features.prediction;
  if (!pred || typeof pred !== 'object') {
    throw new Error('Demo profile requires object: features.prediction');
  }
  if (typeof pred.plugin !== 'string' || !pred.plugin.trim()) {
    throw new Error('features.prediction.plugin must be a non-empty string');
  }
  if (!pred.observationFields || typeof pred.observationFields !== 'object') {
    throw new Error('features.prediction.observationFields is required');
  }
  for (const key of ['seriesKey', 'value', 'weight']) {
    const fieldName = pred.observationFields[key];
    if (typeof fieldName !== 'string' || !fieldName.trim()) {
      throw new Error(`features.prediction.observationFields.${key} must be a non-empty string`);
    }
    if (!fieldNames.has(fieldName)) {
      throw new Error(
        `features.prediction.observationFields.${key} references unknown message field: ${fieldName}`,
      );
    }
  }
  const seriesField = profile.messageFields.find((x) => x.name === pred.observationFields.seriesKey);
  if (!seriesField || seriesField.type !== 'partitionKey') {
    throw new Error('features.prediction.observationFields.seriesKey must name a partitionKey field');
  }
  if (pred.observationFields.seriesKey !== m.partitionKeyField) {
    throw new Error(
      'features.prediction.observationFields.seriesKey must match messaging.partitionKeyField',
    );
  }
  const valueObsField = profile.messageFields.find((x) => x.name === pred.observationFields.value);
  if (!valueObsField || valueObsField.type !== 'float') {
    throw new Error('features.prediction.observationFields.value must name a float message field');
  }
  const weightObsField = profile.messageFields.find((x) => x.name === pred.observationFields.weight);
  if (!weightObsField || weightObsField.type !== 'int') {
    throw new Error('features.prediction.observationFields.weight must name an int message field');
  }
  if (pred.params !== undefined && (typeof pred.params !== 'object' || pred.params === null)) {
    throw new Error('features.prediction.params must be an object when present');
  }

  const uiPred = profile.ui.prediction;
  if (!uiPred || typeof uiPred !== 'object') {
    throw new Error('Demo profile requires object: ui.prediction');
  }
  for (const key of ['tabLabel', 'seriesLabel', 'valueLabel', 'valueFormat']) {
    if (typeof uiPred[key] !== 'string' || !uiPred[key].trim()) {
      throw new Error(`ui.prediction.${key} must be a non-empty string`);
    }
  }
  if (!PREDICTION_VALUE_FORMATS.has(uiPred.valueFormat)) {
    throw new Error(
      `ui.prediction.valueFormat must be one of: ${[...PREDICTION_VALUE_FORMATS].join(', ')}`,
    );
  }
  if (uiPred.valueFormat === 'currency') {
    if (typeof uiPred.currency !== 'string' || !uiPred.currency.trim()) {
      throw new Error('ui.prediction.currency is required when valueFormat is currency');
    }
  }
  if (uiPred.helpTopic !== undefined && (typeof uiPred.helpTopic !== 'string' || !uiPred.helpTopic.trim())) {
    throw new Error('ui.prediction.helpTopic must be a non-empty string when present');
  }
  if (uiPred.accuracyMaxGapPercent !== undefined) {
    const cap = uiPred.accuracyMaxGapPercent;
    if (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0) {
      throw new Error('ui.prediction.accuracyMaxGapPercent must be a positive number when present');
    }
  }

  resolvePlugin(profile).validateProfile(profile);

  if (!profile.queues || typeof profile.queues !== 'object') {
    throw new Error('Demo profile requires object: queues');
  }
  const q = profile.queues;
  for (const key of ['partitioned', 'nonExclusive', 'exclusive']) {
    if (typeof q[key] !== 'string' || !q[key].trim()) {
      throw new Error(`Demo profile requires non-empty string: queues.${key}`);
    }
  }

  return profile;
}

function loadDemoProfile(resolvedPath) {
  if (!resolvedPath || typeof resolvedPath !== 'string') {
    throw new Error('loadDemoProfile requires a non-empty resolvedPath');
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Demo profile file not found: ${resolvedPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(resolvedPath, 'utf8');
  } catch (e) {
    throw new Error(`Failed to read demo profile: ${resolvedPath} (${e.message})`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in demo profile ${resolvedPath}: ${e.message}`);
  }
  return parsed;
}

function resolveProfilesDir() {
  const raw = (process.env.PROFILES_DIR || './profiles').trim();
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/**
 * @returns {object[]} validated profiles sorted by id
 */
function listDemoProfiles(profilesDir) {
  const dir = profilesDir || resolveProfilesDir();
  if (!fs.existsSync(dir)) {
    throw new Error(`Profiles directory not found: ${dir}`);
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
  if (files.length === 0) {
    throw new Error(`No profile JSON files in ${dir}`);
  }
  const profiles = [];
  const seenIds = new Set();
  for (const file of files) {
    const filePath = path.join(dir, file);
    const profile = validateDemoProfile(loadDemoProfile(filePath));
    if (seenIds.has(profile.id)) {
      throw new Error(`Duplicate profile id "${profile.id}" in ${dir}`);
    }
    seenIds.add(profile.id);
    profiles.push(profile);
  }
  profiles.sort((a, b) => a.id.localeCompare(b.id));
  return profiles;
}

function getQueueNames(profile) {
  validateDemoProfile(profile);
  return {
    partitioned: profile.queues.partitioned,
    nonExclusive: profile.queues.nonExclusive,
    exclusive: profile.queues.exclusive,
  };
}

/** @param {object[]} profiles */
function defaultProfileId(profiles) {
  if (!profiles?.length) {
    return 'finance';
  }
  if (profiles.some((p) => p.id === 'finance')) {
    return 'finance';
  }
  return profiles[0].id;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function expandTemplate(field) {
  const pattern = field.pattern;
  const nMin = typeof field.nMin === 'number' ? field.nMin : 1;
  const nMax = typeof field.nMax === 'number' ? field.nMax : 999;
  return pattern.replace(/\{n:(\d+)\}/g, (_, w) => {
    const width = parseInt(w, 10);
    const hi = Math.min(nMax, 10 ** width - 1);
    const lo = Math.min(nMin, hi);
    const n = randomInt(lo, hi);
    return String(n).padStart(width, '0');
  });
}

/**
 * Build one message object from profile.messageFields (in order).
 * @param {object} profile — validated profile
 * @param {{ value: number }} orderCounter — mutable counter for id fields
 * @returns {object}
 */
function generateMessageFromProfile(profile, orderCounter) {
  const message = {};
  const keys = profile.messaging.partitionKeys;

  for (const field of profile.messageFields) {
    switch (field.type) {
      case 'partitionKey': {
        message[field.name] = pickRandom(keys);
        break;
      }
      case 'enum': {
        message[field.name] = pickRandom(field.values);
        break;
      }
      case 'int': {
        message[field.name] = randomInt(field.min, field.max);
        break;
      }
      case 'float': {
        if (field.baselineByPartitionKey && typeof field.baselineByPartitionKey === 'object') {
          const pk = message[profile.messaging.partitionKeyField];
          const base =
            pk != null && field.baselineByPartitionKey[pk] !== undefined
              ? field.baselineByPartitionKey[pk]
              : pickRandom(Object.values(field.baselineByPartitionKey));
          const jitter = field.jitter ?? 0;
          message[field.name] = parseFloat((base + (Math.random() - 0.5) * jitter).toFixed(2));
        } else {
          const v = Math.random() * (field.max - field.min) + field.min;
          message[field.name] = parseFloat(v.toFixed(2));
        }
        break;
      }
      case 'isoTimestamp': {
        message[field.name] = new Date().toISOString();
        break;
      }
      case 'id': {
        const num = orderCounter.value++;
        message[field.name] = `${field.prefix}${String(num).padStart(field.width, '0')}`;
        break;
      }
      case 'template': {
        message[field.name] = expandTemplate(field);
        break;
      }
      default:
        throw new Error(`Unhandled field type: ${field.type}`);
    }
  }

  return message;
}

function jmsxGroupIdForMessage(profile, message) {
  const key = message[profile.messaging.partitionKeyField];
  const idx = profile.messaging.partitionKeys.indexOf(key);
  if (idx < 0) {
    throw new Error(
      `Partition key "${key}" not found in messaging.partitionKeys (JMSXGroupID cannot be computed)`,
    );
  }
  return String(idx);
}

function topicForMessage(profile, message) {
  const suffixField = profile.messaging.topicSuffixFromField;
  const suffix = message[suffixField];
  if (suffix === undefined || suffix === null) {
    throw new Error(`Message missing topic suffix field "${suffixField}"`);
  }
  return `${profile.messaging.topicPrefix}/${suffix}`;
}

let legacyEnvWarned = false;

function warnLegacyEnvIgnoredOnce() {
  if (legacyEnvWarned) return;
  const legacy = [];
  if (process.env.TOPIC_PREFIX) legacy.push('TOPIC_PREFIX');
  if (process.env.SYMBOLS) legacy.push('SYMBOLS');
  if (legacy.length === 0) return;
  legacyEnvWarned = true;
  console.warn(
    `[demo profile] Ignoring legacy env vars ${legacy.join(', ')} because DEMO_PROFILE is set. ` +
      'Remove them from demo.env to silence this warning; they will be removed in a future release.',
  );
}

module.exports = {
  validateDemoProfile,
  loadDemoProfile,
  resolveProfilesDir,
  listDemoProfiles,
  getQueueNames,
  defaultProfileId,
  generateMessageFromProfile,
  jmsxGroupIdForMessage,
  topicForMessage,
  warnLegacyEnvIgnoredOnce,
};

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';

const root = process.cwd();
const readSource = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Imported media Atomes keep project identity in the canonical media properties', () => {
    const source = readSource('eVe/domains/media/asset_box.js');
    const reservedBlock = source.slice(
        source.indexOf('const RESERVED_ATOME_PROPERTY_KEYS'),
        source.indexOf(']);', source.indexOf('const RESERVED_ATOME_PROPERTY_KEYS'))
    );
    const projectBlockIndex = source.indexOf('if (projectId) {');
    const commitIndex = source.indexOf('const res = await commit({', projectBlockIndex);

    assert.equal(reservedBlock.includes("'project_id'"), false, 'project_id must not be stripped from media properties');
    assert.equal(reservedBlock.includes("'projectId'"), false, 'projectId must not be stripped from media properties');
    assert.ok(projectBlockIndex > -1, 'createUploadAtome must write project properties when projectId is known');
    assert.ok(commitIndex > projectBlockIndex, 'project properties must be prepared before the Atome commit');
    assert.ok(
        source.slice(projectBlockIndex, commitIndex).includes('properties.project_id = projectId;'),
        'imported media properties must include project_id'
    );
    assert.ok(
        source.slice(projectBlockIndex, commitIndex).includes('properties.projectId = projectId;'),
        'imported media properties must include projectId'
    );
    assert.ok(
        source.slice(commitIndex, commitIndex + 220).includes('project_id: projectId'),
        'the commit envelope must still carry project_id'
    );
});

test('Project drop creator preserves project identity in rendered media Atome properties', () => {
    const dropSource = readSource('eVe/intuition/tools/project_drop.js');
    const creatorInputIndex = dropSource.indexOf("tool_id: 'ui.creator'");
    const toolSource = readSource('eVe/intuition/runtime/tool_genesis.js');
    const propertiesIndex = toolSource.indexOf('const buildPropertiesFromSpec = (spec, projectId) => {');
    const returnIndex = toolSource.indexOf('return sanitizeAtomeCommitProps(props);', propertiesIndex);

    assert.ok(creatorInputIndex > -1, 'project drop must route imports through the creator gateway');
    assert.ok(
        dropSource.slice(creatorInputIndex, creatorInputIndex + 600).includes('project_id: projectId'),
        'project drop creator input must carry project_id'
    );
    assert.ok(
        toolSource.slice(propertiesIndex, returnIndex).includes('props.project_id = projectId;'),
        'creator properties must preserve project_id'
    );
    assert.ok(
        toolSource.slice(propertiesIndex, returnIndex).includes('props.projectId = projectId;'),
        'creator properties must preserve projectId'
    );
});

import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {describe, test} from 'node:test'
import assert from 'node:assert/strict'

const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'ts-loading')

function runNode(args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: fixturesDir,
    env: {...process.env, ...env},
    encoding: 'utf-8',
    timeout: 10_000,
  })
  return {
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

describe('Node.js TypeScript loading boundaries', () => {
  test('type stripping loads .ts files outside node_modules', () => {
    // Node 22+ can strip types from .ts files outside node_modules
    const result = runNode([
      '--experimental-strip-types',
      '-e',
      `import m from '${path.join(fixturesDir, 'simple.macro.ts').replace(/\\/g, '/')}'; console.log(typeof m)`,
    ])
    assert.ok(
      result.ok,
      `expected success loading .ts outside node_modules: ${result.stderr}`,
    )
    assert.ok(
      result.stdout.includes('function'),
      `expected macro to be a function: ${result.stdout}`,
    )
  })

  test('node_modules restriction blocks .ts type stripping', () => {
    // ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING blocks .ts inside node_modules
    const result = runNode([
      '--experimental-strip-types',
      '-e',
      `require('${path.join(fixturesDir, '..', '..', '..', 'node_modules', 'typescript', 'lib', 'typescript.d.ts').replace(/\\/g, '/')}')`,
    ])
    // This should fail — .ts files inside node_modules cannot be type-stripped
    assert.ok(
      !result.ok || result.stderr.includes('ERR_UNSUPPORTED'),
      `expected node_modules .ts loading to fail or warn: ${result.stderr}`,
    )
  })

  test('TS enums fail without --experimental-transform-types', () => {
    // Enums need transform, not just strip
    const result = runNode([
      '--experimental-strip-types',
      '-e',
      `import m from '${path.join(fixturesDir, 'enum.macro.ts').replace(/\\/g, '/')}'; console.log(typeof m)`,
    ])
    assert.ok(
      !result.ok,
      `expected enum loading to fail without transform-types: ${result.stderr}`,
    )
  })

  test('TS enums work with --experimental-transform-types', () => {
    const result = runNode([
      '--experimental-transform-types',
      '-e',
      `import m from '${path.join(fixturesDir, 'enum.macro.ts').replace(/\\/g, '/')}'; console.log(typeof m)`,
    ])
    assert.ok(
      result.ok,
      `expected enum loading to succeed with transform-types: ${result.stderr}`,
    )
  })
})

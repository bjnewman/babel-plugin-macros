import path from 'node:path'
import fs from 'node:fs'
import {describe, test, before, after} from 'node:test'
import assert from 'node:assert/strict'
import {transformSync} from '@babel/core'

const projectRoot = path.join(import.meta.dirname, '../../')
const selfLink = path.join(projectRoot, 'node_modules', 'babel-plugin-macros')
let originalTarget = null

before(() => {
  // Replace the published babel-plugin-macros with our local dist
  // so real-world macros use our code when they require('babel-plugin-macros')
  if (fs.existsSync(selfLink)) {
    const stat = fs.lstatSync(selfLink)
    if (stat.isSymbolicLink()) {
      originalTarget = fs.readlinkSync(selfLink)
      fs.unlinkSync(selfLink)
    } else {
      originalTarget = '__directory__'
      fs.renameSync(selfLink, selfLink + '.bak')
    }
  }
  fs.symlinkSync(path.join(projectRoot, 'dist'), selfLink)
})

after(() => {
  // Restore original
  fs.unlinkSync(selfLink)
  if (originalTarget === '__directory__') {
    fs.renameSync(selfLink + '.bak', selfLink)
  } else if (originalTarget) {
    fs.symlinkSync(originalTarget, selfLink)
  }
})

function transform(code) {
  const result = transformSync(code, {
    filename: path.join(import.meta.dirname, 'integration-test.js'),
    parserOpts: {plugins: ['jsx']},
    plugins: [path.join(projectRoot, 'dist', 'index.js')],
  })
  return result.code
}

describe('real-world macro integration', () => {
  test('preval.macro evaluates expressions at build time', () => {
    const code = `
      import preval from 'preval.macro'
      const one = preval\`module.exports = 1 + 1\`
    `
    const output = transform(code)
    assert.ok(output.includes('2'), `expected "2" in output: ${output}`)
    assert.ok(
      !output.includes('preval'),
      `expected no "preval" in output: ${output}`,
    )
  })

  test('codegen.macro generates code at build time', () => {
    const code = `
      import codegen from 'codegen.macro'
      codegen\`module.exports = "const x = 42"\`
    `
    const output = transform(code)
    assert.ok(
      output.includes('const x = 42'),
      `expected "const x = 42" in output: ${output}`,
    )
    assert.ok(
      !output.includes('codegen'),
      `expected no "codegen" in output: ${output}`,
    )
  })

  test('ms.macro converts time strings to milliseconds', () => {
    const code = `
      import ms from 'ms.macro'
      const oneDay = ms('1 day')
    `
    const output = transform(code)
    assert.ok(
      output.includes('86400000'),
      `expected "86400000" in output: ${output}`,
    )
    assert.ok(
      !output.includes("ms('1 day')"),
      `expected ms call to be replaced: ${output}`,
    )
  })
})

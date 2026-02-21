import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createMacro} from '../../dist/index.js'

test('throws error if it is not transpiled', () => {
  const untranspiledMacro = createMacro(() => {})
  assert.throws(() => untranspiledMacro({source: 'untranspiled.macro'}), {
    name: 'MacroError',
    message:
      'The macro you imported from "untranspiled.macro" is being executed outside the context of compilation with babel-plugin-macros. ' +
      'This indicates that you don\'t have the babel plugin "babel-plugin-macros" configured correctly. ' +
      'Please see the documentation for how to configure babel-plugin-macros properly: ' +
      'https://github.com/kentcdodds/babel-plugin-macros/blob/main/other/docs/user.md',
  })
})

test('attempting to create a macros with the configName of options throws an error', () => {
  assert.throws(() => createMacro(() => {}, {configName: 'options'}), {
    message:
      'You cannot use the configName "options". It is reserved for babel-plugin-macros.',
  })
})

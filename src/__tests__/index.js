import path from 'node:path'
import fs from 'node:fs'
import {createRequire} from 'node:module'
import {describe, it, before, beforeEach, afterEach, mock} from 'node:test'
import assert from 'node:assert/strict'
import {pluginTester} from 'babel-plugin-tester'
import plugin, {_resetConfigExplorer} from '../../dist/index.js'

// babel-plugin-tester requires these globals
globalThis.describe = describe
globalThis.it = it
globalThis.it.only = (...args) => it(args[0], {only: true}, args[1])

const _require = createRequire(import.meta.url)
const projectRoot = path.join(import.meta.dirname, '../../')

before(() => {
  // copy our mock modules to the node_modules directory
  // so we can test how things work when importing a macro
  // from the node_modules directory.
  const src = path.join(projectRoot, 'other', 'mock-modules')
  const dest = path.join(projectRoot, 'node_modules')
  fs.cpSync(src, dest, {recursive: true})
})

let consoleErrorMock
beforeEach(() => {
  consoleErrorMock = mock.method(console, 'error', () => {})
})

afterEach(() => {
  consoleErrorMock.mock.restore()
  // Clear spy state in fixture macros (ESM modules cached outside require.cache)
  const configFixtures = [
    'config',
    'yaml-config',
    'cjs-config',
    'primitive-config',
    'no-config',
    'error-config',
  ]
  for (const fixture of configFixtures) {
    try {
      _require(
        `./fixtures/${fixture}/configurable.macro.js`,
      ).realMacro?.mockClear?.()
    } catch {
      /* module not yet loaded */
    }
  }
  // Clear spy state in CJS mock modules + flush require.cache
  const mockModules = [
    'babel-plugin-macros-test-fake/macro',
    '@scope/package/macro',
    'babel-plugin-macros-test-transpiled/macro',
  ]
  for (const name of mockModules) {
    try {
      const mod = _require(name)
      mod.innerFn?.mockClear?.()
    } catch {
      /* module not yet loaded */
    }
    // CJS modules live in require.cache — delete to get fresh spies
    const resolved = _require.resolve(name)
    delete _require.cache[resolved]
  }
  _resetConfigExplorer()
})

pluginTester({
  plugin,
  babelOptions: {
    filename: import.meta.filename,
    parserOpts: {
      plugins: ['jsx'],
    },
    generatorOpts: {quotes: 'double'},
  },
  tests: [
    {
      title: 'does nothing to code that does not import macro',
      code: `
        import foo from './some-file-without-macro'
        const bar = require('./some-other-file-without-macro')
      `,
      output: `
        import foo from './some-file-without-macro'
        const bar = require('./some-other-file-without-macro')
      `,
    },
    {
      title: 'does nothing but remove macros if it is unused',
      code: `
        import foo from "./fixtures/eval.macro";

        const bar = 42;
      `,
      output: `const bar = 42`,
    },
    {
      title: 'raises an error if macro does not exist',
      error: true,
      code: `
        import foo from './some-macros-that-doesnt-even-need-to-exist.macro'
        export default 'something else'
      `,
    },
    {
      title: 'works with import',
      code: `
        import myEval from './fixtures/eval.macro'
        const x = myEval\`34 + 45\`
      `,
      output: `const x = 79`,
    },
    {
      title: 'works with require',
      code: `
        const evaler = require('./fixtures/eval.macro')
        const x = evaler\`34 + 45\`
      `,
      output: `const x = 79`,
    },
    {
      title: 'works with require destructuring',
      code: `
        const {css, styled} = require('./fixtures/emotion.macro')
        const red = css\`
          background-color: red;
        \`

        const Div = styled.div\`
          composes: \${red}
          color: blue;
        \`
      `,
      output: `
        const red = 'background-color: red;'
        const Div = styled.div\`composes: background-color: red;
          color: blue;\`
      `,
    },
    {
      title: 'works with require destructuring and aliasing',
      code: `
        const {css: CSS, styled: STYLED} = require('./fixtures/emotion.macro')
        const red = CSS\`
          background-color: red;
        \`

        const Div = STYLED.div\`
          composes: \${red}
          color: blue;
        \`
      `,
      output: `
        const red = 'background-color: red;'
        const Div = STYLED.div\`composes: background-color: red;
          color: blue;\`
      `,
    },
    {
      title: 'works with function calls',
      code: `
        import myEval from './fixtures/eval.macro'
        const x = myEval('34 + 45')
      `,
      output: `const x = 79`,
    },
    {
      title: 'Works as a JSXElement',
      code: `
        import MyEval from './fixtures/eval.macro'
        const x = <MyEval>34 + 45</MyEval>
      `,
      output: `const x = 79`,
    },
    {
      title: 'Supports named imports',
      code: `
        import {css as CSS, styled as STYLED} from './fixtures/emotion.macro'
        const red = CSS\`
          background-color: red;
        \`

        const Div = STYLED.div\`
          composes: \${red}
          color: blue;
        \`
      `,
      output: `
        const red = 'background-color: red;'
        const Div = STYLED.div\`composes: background-color: red;
          color: blue;\`
      `,
    },
    {
      title: 'supports macros with default export',
      code: `
        import {css, styled} from './fixtures/emotion-esm.macro'
        const red = css\`
          background-color: red;
        \`

        const Div = styled.div\`
          composes: \${red}
          color: blue;
        \`
      `,
      output: `
        const red = css\`
          background-color: red;
        \`
        const Div = styled.div\`
          composes: \${red}
          color: blue;
        \`
      `,
    },
    {
      title: 'supports macros from node_modules',
      code: `
        import fakeMacro from 'babel-plugin-macros-test-fake/macro'
        fakeMacro('hi')
      `,
      output: `fakeMacro('hi')`,
      teardown() {
        const fakeMacro = _require('babel-plugin-macros-test-fake/macro')
        assert.equal(fakeMacro.innerFn.calls.length, 1)
        const callArgs = fakeMacro.innerFn.calls[0][0]
        assert.ok(callArgs.references)
        assert.ok(
          callArgs.source.includes('babel-plugin-macros-test-fake/macro'),
        )
        assert.ok(callArgs.state)
        assert.ok(callArgs.babel)
        assert.equal(callArgs.isBabelMacrosCall, true)
        assert.ok(callArgs.babel.types)
        assert.equal(typeof callArgs.babel.transform, 'function')
      },
    },
    {
      title: 'supports macros from node_modules with scope',
      code: `
        import fakeMacro from '@scope/package/macro'
        fakeMacro('hi')
      `,
      output: `fakeMacro('hi')`,
      teardown() {
        const fakeMacro = _require('@scope/package/macro')
        assert.equal(fakeMacro.innerFn.calls.length, 1)
        const callArgs = fakeMacro.innerFn.calls[0][0]
        assert.ok(callArgs.references)
        assert.ok(callArgs.source.includes('@scope/package/macro'))
        assert.ok(callArgs.state)
        assert.ok(callArgs.babel)
        assert.equal(callArgs.isBabelMacrosCall, true)
        assert.ok(callArgs.babel.types)
        assert.equal(typeof callArgs.babel.transform, 'function')
      },
    },
    {
      title: 'supports transpiled ESM macros from node_modules',
      code: `
        import fakeMacro from 'babel-plugin-macros-test-transpiled/macro'
        fakeMacro('hi')
      `,
      output: `fakeMacro('hi')`,
      teardown() {
        const fakeMacro = _require('babel-plugin-macros-test-transpiled/macro')
        assert.equal(fakeMacro.innerFn.calls.length, 1)
        const callArgs = fakeMacro.innerFn.calls[0][0]
        assert.ok(callArgs.references)
        assert.ok(
          callArgs.source.includes('babel-plugin-macros-test-transpiled/macro'),
        )
        assert.ok(callArgs.state)
        assert.ok(callArgs.babel)
        assert.equal(callArgs.isBabelMacrosCall, true)
      },
    },
    {
      title: 'optionally keep imports (variable assignment)',
      code: `
        const macro = require('./fixtures/keep-imports.macro')
        const red = macro('noop');
      `,
      output: `
        const macro = require('./fixtures/keep-imports.macro')
        const red = macro('noop')
      `,
    },
    {
      title: 'optionally keep imports (import declaration)',
      code: `
        import macro from './fixtures/keep-imports.macro'
        const red = macro('noop');
      `,
      output: `
        import macro from './fixtures/keep-imports.macro'
        const red = macro('noop')
      `,
    },
    {
      title:
        'optionally keep imports in combination with CJS module transform (#80)',
      code: `
        import macro from './fixtures/keep-imports.macro'
        const red = macro('noop')
      `,
      babelOptions: {
        plugins: [_require.resolve('@babel/plugin-transform-modules-commonjs')],
      },
      output: `
        'use strict'

        var _keepImports = _interopRequireDefault(
          require('./fixtures/keep-imports.macro'),
        )
        function _interopRequireDefault(e) {
          return e && e.__esModule ? e : {default: e}
        }
        const red = (0, _keepImports.default)('noop')
      `,
    },
    {
      title: 'throws an error if the macro is not properly wrapped',
      error: true,
      code: `
        import unwrapped from './fixtures/non-wrapped.macro'
        unwrapped('hey')
      `,
    },
    {
      title: 'forwards MacroErrors thrown by the macro',
      error: true,
      code: `
        import errorThrower from './fixtures/macro-error-thrower.macro'
        errorThrower('hey')
      `,
    },
    {
      title: 'prepends the relative path for errors thrown by the macro',
      error: true,
      code: `
        import errorThrower from './fixtures/error-thrower.macro'
        errorThrower('hey')
      `,
    },
    {
      title: 'appends the npm URL for errors thrown by node modules',
      error: true,
      code: `
        import errorThrower from 'babel-plugin-macros-test-error-thrower.macro'
        errorThrower('hi')
      `,
    },
    {
      title:
        'appends the npm URL for errors thrown by node modules with a slash',
      error: true,
      code: `
        import errorThrower from 'babel-plugin-macros-test-error-thrower/macro'
        errorThrower('hi')
      `,
    },
    {
      title: 'macros can set their configName and get their config',
      fixture: path.join(import.meta.dirname, 'fixtures/config/code.js'),
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const babelMacrosConfig = _require(
          './fixtures/config/babel-plugin-macros.config.js',
        ).default
        const configurableMacro = _require(
          './fixtures/config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        assert.deepEqual(
          configurableMacro.realMacro.calls[0][0].config,
          babelMacrosConfig[configurableMacro.configName],
        )
      },
    },
    {
      title: 'macros can load config from a YAML file',
      fixture: path.join(import.meta.dirname, 'fixtures/yaml-config/code.js'),
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const configurableMacro = _require(
          './fixtures/yaml-config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        assert.deepEqual(configurableMacro.realMacro.calls[0][0].config, {
          fileConfig: true,
          yamlConfig: true,
        })
      },
    },
    {
      title: 'macros can load config from a CJS config file',
      fixture: path.join(import.meta.dirname, 'fixtures/cjs-config/code.js'),
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const configurableMacro = _require(
          './fixtures/cjs-config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        assert.deepEqual(configurableMacro.realMacro.calls[0][0].config, {
          cjsConfig: true,
        })
      },
    },
    {
      title:
        'when there is an error reading the config, a helpful message is logged',
      error: true,
      fixture: path.join(import.meta.dirname, 'fixtures/error-config/code.js'),
      teardown() {
        assert.equal(consoleErrorMock.mock.callCount(), 1)
        const message = consoleErrorMock.mock.calls[0].arguments[0]
        assert.equal(
          message,
          'There was an error trying to load the config "configurableMacro" ' +
            'for the macro imported from "./configurable.macro. ' +
            'Please see the error thrown for more information.',
        )
      },
    },
    {
      title: 'when there is no config to load, then no config is passed',
      fixture: path.join(import.meta.dirname, 'fixtures/no-config/code.js'),
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const configurableMacro = _require(
          './fixtures/no-config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        assert.deepEqual(configurableMacro.realMacro.calls[0][0].config, {})
      },
    },
    {
      title: 'when configuration is specified in plugin options',
      pluginOptions: {
        configurableMacro: {
          someConfig: false,
          somePluginConfig: true,
        },
      },
      fixture: path.join(import.meta.dirname, 'fixtures/config/code.js'),
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const configurableMacro = _require(
          './fixtures/config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        assert.deepEqual(configurableMacro.realMacro.calls[0][0].config, {
          fileConfig: true,
          someConfig: true,
          somePluginConfig: true,
        })
      },
    },
    {
      title: 'when configuration is specified in plugin options (CJS)',
      pluginOptions: {
        configurableMacro: {
          someConfig: false,
          somePluginConfig: true,
        },
      },
      fixture: path.join(import.meta.dirname, 'fixtures/config/cjs-code.js'),
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const configurableMacro = _require(
          './fixtures/config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        assert.deepEqual(configurableMacro.realMacro.calls[0][0].config, {
          fileConfig: true,
          someConfig: true,
          somePluginConfig: true,
        })
      },
    },
    {
      title: 'when configuration is specified incorrectly in plugin options',
      fixture: path.join(import.meta.dirname, 'fixtures/config/code.js'),
      pluginOptions: {
        configurableMacro: 2,
      },
      output: `
        // eslint-disable-next-line babel/no-unused-expressions
        configured\`stuff\`
      `,
      teardown() {
        const configurableMacro = _require(
          './fixtures/config/configurable.macro.js',
        )
        assert.equal(configurableMacro.realMacro.calls.length, 1)
        // invalid plugin option (2) is ignored; file config used as-is
        assert.deepEqual(configurableMacro.realMacro.calls[0][0].config, {
          fileConfig: true,
          someConfig: true,
        })
      },
    },
    {
      title: 'when a custom isMacrosName option is used on a import',
      pluginOptions: {
        isMacrosName(v) {
          return v.endsWith('-macro.js')
        },
      },
      code: `
        import myEval from './fixtures/eval-macro.js'
        const x = myEval\`34 + 45\`
      `,
      output: `const x = 79`,
    },
    {
      title: 'when a custom isMacrosName option is used on a require',
      pluginOptions: {
        isMacrosName(v) {
          return v.endsWith('-macro.js')
        },
      },
      code: `
        const evaler = require('./fixtures/eval-macro.js')
        const x = evaler\`34 + 45\`
      `,
      output: `const x = 79`,
    },
    {
      title:
        'when plugin options configuration cannot be merged with file configuration',
      error: true,
      fixture: path.join(
        import.meta.dirname,
        'fixtures/primitive-config/code.js',
      ),
      pluginOptions: {
        configurableMacro: {},
      },
    },
    {
      title:
        'when a plugin that replaces paths is used, macros still work properly',
      fixture: path.join(
        import.meta.dirname,
        'fixtures/path-replace-issue/variable-assignment.js',
      ),
      babelOptions: {
        babelrc: true,
      },
      output: `
        const result = ('foobar', 42)
        global.result = result
      `,
    },
    {
      title: 'Macros are applied in the order respecting plugins order',
      code: `
        import Wrap from "./fixtures/jsx-id-prefix.macro";

        const bar = Wrap(<div id="d1"><p id="p1"></p></div>);
      `,
      babelOptions: {
        presets: [
          {plugins: [_require('./fixtures/jsx-id-prefix.plugin.js').default]},
        ],
      },
      output: `
        const bar = Wrap(
          <div id="plugin-macro-d1">
            <p id="plugin-macro-p1"></p>
          </div>,
        )
      `,
    },
  ],
})

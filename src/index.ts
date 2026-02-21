import path, {dirname} from 'node:path'
import {createRequire} from 'node:module'
import resolve from 'resolve'
import {lilconfigSync} from 'lilconfig'
import yaml from 'yaml'
import type {PluginObj, PluginPass, NodePath} from '@babel/core'
import type * as BabelTypes from '@babel/types'

const _require = createRequire(import.meta.url)

const macrosRegex = /[./]macro(\.c?js)?$/
const testMacrosRegex = (v: string) => macrosRegex.test(v)

interface MacroParams {
  references: Record<string, NodePath[]>
  source: string
  state: PluginPass
  babel: typeof import('@babel/core')
  config: Record<string, unknown> | undefined
  isBabelMacrosCall: true
}

type MacroHandler = (params: MacroParams) => {keepImports?: boolean} | void

interface MacroOptions {
  configName?: string
}

interface MacroWrapper {
  (args: MacroParams): {keepImports?: boolean} | void
  isBabelMacro: boolean
  options: MacroOptions
}

interface PluginOptions {
  require?: NodeRequire
  resolvePath?: (source: string, basedir: string) => string
  isMacrosName?: (name: string) => boolean
  [configName: string]: unknown
}

function unwrapEsmDefault(mod: unknown): unknown {
  const m = mod as Record<string | symbol, unknown> | null | undefined
  return m?.[Symbol.toStringTag] === 'Module' || m?.__esModule
    ? (m as {default: unknown}).default
    : mod
}

class MacroError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MacroError'
    Error.captureStackTrace(this, this.constructor)
  }
}

function loadYaml(_filepath: string, content: string) {
  return yaml.parse(content)
}

function loadJsConfig(filepath: string) {
  return unwrapEsmDefault(_require(filepath))
}

let _configExplorer: ReturnType<typeof lilconfigSync> | null = null
/** @internal Reset cached config explorer — for testing only. */
function _resetConfigExplorer() {
  _configExplorer = null
}
function getConfigExplorer() {
  return (_configExplorer ??= lilconfigSync('babel-plugin-macros', {
    searchPlaces: [
      'package.json',
      '.babel-plugin-macrosrc',
      '.babel-plugin-macrosrc.json',
      '.babel-plugin-macrosrc.yaml',
      '.babel-plugin-macrosrc.yml',
      '.babel-plugin-macrosrc.js',
      '.babel-plugin-macrosrc.cjs',
      'babel-plugin-macros.config.js',
      'babel-plugin-macros.config.cjs',
    ],
    packageProp: 'babelMacros',
    loaders: {
      '.js': loadJsConfig,
      '.yaml': loadYaml,
      '.yml': loadYaml,
      noExt: loadYaml,
    },
  }))
}

function createMacro(
  macro: MacroHandler,
  options: MacroOptions = {},
): MacroWrapper {
  if (options.configName === 'options') {
    throw new Error(
      `You cannot use the configName "options". It is reserved for babel-plugin-macros.`,
    )
  }
  macroWrapper.isBabelMacro = true as const
  macroWrapper.options = options
  return macroWrapper as MacroWrapper

  function macroWrapper(args: MacroParams) {
    const {source, isBabelMacrosCall} = args
    if (!isBabelMacrosCall) {
      throw new MacroError(
        `The macro you imported from "${source}" is being executed outside the context of compilation with babel-plugin-macros. ` +
          `This indicates that you don't have the babel plugin "babel-plugin-macros" configured correctly. ` +
          `Please see the documentation for how to configure babel-plugin-macros properly: ` +
          'https://github.com/kentcdodds/babel-plugin-macros/blob/main/other/docs/user.md',
      )
    }
    return macro(args)
  }
}

function nodeResolvePath(source: string, basedir: string) {
  return resolve.sync(source, {
    basedir,
    extensions: ['.js', '.ts', '.tsx', '.mjs', '.cjs', '.jsx'],
    // This is here to support the package being globally installed
    // read more: https://github.com/kentcdodds/babel-plugin-macros/pull/138
    paths: [path.resolve(import.meta.dirname, '../../')],
  })
}

interface ImportInfo {
  localName: string
  importedName: string
}

function macrosPlugin(
  babel: typeof import('@babel/core'),
  {
    require: requireFn = _require,
    resolvePath = nodeResolvePath,
    isMacrosName = testMacrosRegex,
    ...options
  }: PluginOptions = {},
): PluginObj<PluginPass> {
  function interopRequire(modulePath: string) {
    return unwrapEsmDefault(requireFn(modulePath))
  }

  return {
    name: 'macros',
    visitor: {
      Program(progPath, state) {
        progPath.traverse({
          ImportDeclaration(
            importPath: NodePath<BabelTypes.ImportDeclaration>,
          ) {
            const isMacros = looksLike(importPath, {
              node: {
                source: {
                  value: (v: string) => isMacrosName(v),
                },
              },
            })
            if (!isMacros) {
              return
            }
            const imports: ImportInfo[] = importPath.node.specifiers.map(s => ({
              localName: s.local.name,
              importedName:
                s.type === 'ImportDefaultSpecifier'
                  ? 'default'
                  : (s as BabelTypes.ImportSpecifier).imported.type ===
                      'Identifier'
                    ? (
                        (s as BabelTypes.ImportSpecifier)
                          .imported as BabelTypes.Identifier
                      ).name
                    : (
                        (s as BabelTypes.ImportSpecifier)
                          .imported as BabelTypes.StringLiteral
                      ).value,
            }))
            const source = importPath.node.source.value
            const result = applyMacros({
              path: importPath,
              imports,
              source,
              state,
              babel,
              interopRequire,
              resolvePath,
              options,
            })

            if (!result || !result.keepImports) {
              importPath.remove()
            }
          },
          VariableDeclaration(
            varPath: NodePath<BabelTypes.VariableDeclaration>,
          ) {
            const isMacros = (child: NodePath<BabelTypes.VariableDeclarator>) =>
              looksLike(child, {
                node: {
                  init: {
                    callee: {
                      type: 'Identifier',
                      name: 'require',
                    },
                    arguments: (args: BabelTypes.Node[]) =>
                      args.length === 1 &&
                      isMacrosName((args[0] as BabelTypes.StringLiteral).value),
                  },
                },
              })

            varPath
              .get('declarations')
              .filter(isMacros)
              .forEach(child => {
                const id = child.node.id
                const imports: ImportInfo[] =
                  id.type === 'Identifier'
                    ? [{localName: id.name, importedName: 'default'}]
                    : (id as BabelTypes.ObjectPattern).properties.map(
                        property => {
                          const prop = property as BabelTypes.ObjectProperty
                          return {
                            localName: (prop.value as BabelTypes.Identifier)
                              .name,
                            importedName: (prop.key as BabelTypes.Identifier)
                              .name,
                          }
                        },
                      )

                const call = child.get(
                  'init',
                ) as NodePath<BabelTypes.CallExpression>
                const source = (
                  call.node.arguments[0] as BabelTypes.StringLiteral
                ).value
                const result = applyMacros({
                  path: call,
                  imports,
                  source,
                  state,
                  babel,
                  interopRequire,
                  resolvePath,
                  options,
                })

                if (!result || !result.keepImports) {
                  child.remove()
                }
              })
          },
        })
      },
    },
  }
}

interface ApplyMacrosArgs {
  path: NodePath
  imports: ImportInfo[]
  source: string
  state: PluginPass
  babel: typeof import('@babel/core')
  interopRequire: (path: string) => unknown
  resolvePath: (source: string, basedir: string) => string
  options: Record<string, unknown>
}

function applyMacros({
  path: macroPath,
  imports,
  source,
  state,
  babel,
  interopRequire,
  resolvePath,
  options,
}: ApplyMacrosArgs) {
  const filename = state.file.opts.filename ?? ''
  const referencePathsByImportName = imports.reduce<Record<string, NodePath[]>>(
    (byName, {importedName, localName}) => {
      const binding = macroPath.scope.getBinding(localName)
      byName[importedName] = binding ? binding.referencePaths : []
      return byName
    },
    {},
  )

  const isRelative = source.startsWith('.')
  const requirePath = resolvePath(source, dirname(getFullFilename(filename)))

  const macro = interopRequire(requirePath) as MacroWrapper
  if (!macro.isBabelMacro) {
    throw new Error(
      `The macro imported from "${source}" must be wrapped in "createMacro" ` +
        `which you can get from "babel-plugin-macros". ` +
        `Please refer to the documentation to see how to do this properly: https://github.com/kentcdodds/babel-plugin-macros/blob/main/other/docs/author.md#writing-a-macro`,
    )
  }
  const config = getConfig(macro, filename, source, options)

  let result: {keepImports?: boolean} | void
  try {
    /**
     * Other plugins that run before babel-plugin-macros might use path.replace, where a path is
     * put into its own replacement. Apparently babel does not update the scope after such
     * an operation. As a remedy, the whole scope is traversed again with an empty "Identifier"
     * visitor - this makes the problem go away.
     *
     * See: https://github.com/kentcdodds/import-all.macro/issues/7
     */
    state.file.scope.path.traverse({
      Identifier() {},
    })

    result = macro({
      references: referencePathsByImportName,
      source,
      state,
      babel,
      config,
      isBabelMacrosCall: true,
    })
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'MacroError') {
        throw error
      }
      error.message = `${source}: ${error.message}`
      if (!isRelative) {
        error.message = `${
          error.message
        } Learn more: https://www.npmjs.com/package/${source.replace(
          // remove everything after package name
          // @org/package/macro -> @org/package
          // package/macro      -> package
          /^((?:@[^/]+\/)?[^/]+).*/,
          '$1',
        )}`
      }
    }
    throw error
  }
  return result
}

interface FileConfigResult {
  options?: unknown
  path?: string
  error?: unknown
}

function getConfigFromFile(
  configName: string,
  filename: string,
): FileConfigResult {
  try {
    const loaded = getConfigExplorer().search(filename)

    if (loaded) {
      return {
        options: (loaded.config as Record<string, unknown>)[configName],
        path: loaded.filepath,
      }
    }
  } catch (e) {
    return {error: e}
  }
  return {}
}

interface OptionsConfigResult {
  options?: unknown
}

function getConfigFromOptions(
  configName: string,
  options: Record<string, unknown>,
): OptionsConfigResult {
  if (Object.hasOwn(options, configName)) {
    if (options[configName] && typeof options[configName] !== 'object') {
      console.error(
        `The macro plugin options' ${configName} property was not an object or null.`,
      )
    } else {
      return {options: options[configName]}
    }
  }
  return {}
}

function getConfig(
  macro: MacroWrapper,
  filename: string,
  source: string,
  options: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const {configName} = macro.options
  if (configName) {
    const fileConfig = getConfigFromFile(configName, filename)
    const optionsConfig = getConfigFromOptions(configName, options)

    if (
      optionsConfig.options === undefined &&
      fileConfig.options === undefined &&
      fileConfig.error !== undefined
    ) {
      console.error(
        `There was an error trying to load the config "${configName}" ` +
          `for the macro imported from "${source}. ` +
          `Please see the error thrown for more information.`,
      )
      throw fileConfig.error
    }

    if (
      fileConfig.options !== undefined &&
      optionsConfig.options !== undefined &&
      typeof fileConfig.options !== 'object'
    ) {
      throw new Error(
        `${fileConfig.path} specified a ${configName} config of type ` +
          `${typeof optionsConfig.options}, but the the macros plugin's ` +
          `options.${configName} did contain an object. Both configs must ` +
          `contain objects for their options to be mergeable.`,
      )
    }

    return {
      ...(optionsConfig.options as Record<string, unknown> | undefined),
      ...(fileConfig.options as Record<string, unknown> | undefined),
    }
  }
  return undefined
}

function getFullFilename(filename: string): string {
  if (path.isAbsolute(filename)) {
    return filename
  }
  return path.join(process.cwd(), filename)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function looksLike(a: any, b: Record<string, any>): boolean {
  return (
    a &&
    b &&
    Object.keys(b).every(bKey => {
      const bVal = b[bKey]
      const aVal = a[bKey]
      if (typeof bVal === 'function') {
        return bVal(aVal)
      }
      return isPrimitive(bVal) ? bVal === aVal : looksLike(aVal, bVal)
    })
  )
}

function isPrimitive(val: unknown): boolean {
  return val == null || /^[sbn]/.test(typeof val)
}

export default macrosPlugin
export {createMacro, MacroError, _resetConfigExplorer}
export type {MacroParams, MacroHandler, MacroOptions}

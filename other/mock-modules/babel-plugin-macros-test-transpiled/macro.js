// Simulates a package transpiled from ESM to CJS (e.g., by Babel or TypeScript).
// These modules have __esModule marker and a .default property, but no
// Symbol.toStringTag (which only exists on native ESM module namespaces).
Object.defineProperty(exports, '__esModule', {value: true})

const {createMacro} = require('../../dist')
function innerFn(...args) {
  innerFn.calls.push(args)
}
innerFn.calls = []
innerFn.mockClear = () => {
  innerFn.calls.length = 0
}
exports.default = createMacro(innerFn)
exports.innerFn = innerFn

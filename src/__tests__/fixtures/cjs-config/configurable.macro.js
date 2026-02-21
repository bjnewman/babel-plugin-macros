const {createMacro} = require('../../../../dist/index.js')

const configName = 'configurableMacro'
function realMacro(...args) {
  realMacro.calls.push(args)
}
realMacro.calls = []
realMacro.mockClear = () => {
  realMacro.calls.length = 0
}
const macro = createMacro(realMacro, {configName})
module.exports = macro
// for testing purposes only
module.exports.realMacro = realMacro
module.exports.configName = configName

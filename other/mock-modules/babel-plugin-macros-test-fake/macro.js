// this is used to make sure that you can require macro from node_modules
const {createMacro} = require('../../dist')

function innerFn(...args) {
  innerFn.calls.push(args)
}
innerFn.calls = []
innerFn.mockClear = () => {
  innerFn.calls.length = 0
}
module.exports = createMacro(innerFn)
module.exports.innerFn = innerFn

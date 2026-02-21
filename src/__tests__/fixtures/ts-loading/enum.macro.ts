import {createMacro} from '../../../../dist/index.js'

// TS enums require --experimental-transform-types, not just --experimental-strip-types
enum Mode {
  Dev = 'dev',
  Prod = 'prod',
}

const handler = () => {
  console.log(Mode.Dev)
}

export default createMacro(handler)

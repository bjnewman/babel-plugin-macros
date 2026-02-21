import {createMacro} from '../../../../dist/index.js'
import type {MacroHandler} from '../../../../dist/index.js'

const handler: MacroHandler = () => {
  // no-op macro for TS loading test
}

export default createMacro(handler)

import {createMacro} from '../../../dist/index.js'

export default createMacro(evalMacro)

function evalMacro() {
  // we're lazy right now
  // we don't want to eval
}

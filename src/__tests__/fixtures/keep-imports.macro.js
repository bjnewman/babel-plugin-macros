import {createMacro} from '../../../dist/index.js'

export default createMacro(keepImportMacro)

function keepImportMacro() {
  return {keepImports: true}
}

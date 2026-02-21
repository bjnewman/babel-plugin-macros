// const printAST = require('ast-pretty-print')
import {createMacro, MacroError} from '../../../dist/index.js'

export default createMacro(evalMacro)

function evalMacro() {
  throw new MacroError('very helpful')
}

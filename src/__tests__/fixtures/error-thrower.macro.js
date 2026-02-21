// const printAST = require('ast-pretty-print')
import {createMacro} from '../../../dist/index.js'

export default createMacro(evalMacro)

function evalMacro() {
  throw new Error('very unhelpful')
}

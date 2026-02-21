import {createMacro} from '../../../../dist/index.js'
import {createSpy} from '../../helpers/create-spy.js'

const configName = 'configurableMacro'
const realMacro = createSpy()
const macro = createMacro(realMacro, {configName})
export default macro
// for testing purposes only
export {realMacro, configName}

/**
 * Framework-agnostic spy factory.
 * Tracks calls and supports mockClear() for test teardown.
 */
export function createSpy(impl = () => {}) {
  function spy(...args) {
    spy.calls.push(args)
    return impl(...args)
  }
  spy.calls = []
  spy.mockClear = () => {
    spy.calls.length = 0
  }
  return spy
}

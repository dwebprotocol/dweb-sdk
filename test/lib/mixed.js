const createNative = require('./native')
const createDHub = require('./dhub')

module.exports = async function createMixed (n) {
  const nNative = Math.ceil(n / 2)
  const nDHub = n - nNative
  const native = await createNative(nNative)
  const dhub = await createDHub(nDHub)
  const sdks = []
  for (let i = 0; i < n; i++) {
    sdks.push(i % 2 === 0 ? native.sdks.shift() : dhub.sdks.shift())
  }
  return { sdks, cleanup }
  function cleanup () {
    native.cleanup()
    dhub.cleanup()
  }
}

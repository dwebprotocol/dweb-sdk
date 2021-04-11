const SDK = require('../../dhub')

const isBrowser = process.title === 'browser'
const DHUB_TEST_PORT = 9000

module.exports = async function createDHub (n) {
  const cleanups = []
  const sdks = []
  if (!isBrowser) {
    const { createMany } = require('dhub/test/helpers/create')
    const { clients, cleanup: cleanupDHub } = await createMany(n)
    cleanups.push(cleanupDHub)
    for (const client of clients) {
      const sdk = await SDK({
        dhubOpts: { client }
      })
      sdks.push(sdk)
    }
  } else {
    let port = DHUB_TEST_PORT
    while (port < DHUB_TEST_PORT + n) {
      const sdk = await SDK({
        dhubOpts: { port }
      })
      sdks.push(sdk)
      port++
    }
  }

  return { sdks, cleanup }

  function cleanup () {
    for (const cleanup of cleanups) {
      cleanup()
    }
  }
}

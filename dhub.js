const DHubClient = require('@dhub/client')
const { connect } = require('webnet')
const SDK = require('./sdk')

const isBrowser = process.title === 'browser'

module.exports = async function createSDK (opts) {
  return SDK({ ...opts, backend: dhubBackend })
}
module.exports.createBackend = dhubBackend

async function dhubBackend (opts) {
  let {
    basestore,
    dhubOpts = {}
  } = opts

  let dhubClient
  if (!basestore) {
    let { client, protocol, port, host } = dhubOpts
    if (client) {
      dhubClient = client
    } else {
      if (!protocol) {
        protocol = isBrowser ? 'ws' : 'uds'
      }
      let clientOpts
      if (protocol === 'ws') {
        port = port || 9000
        clientOpts = connect(port, host)
      } else if (protocol === 'uds') {
        clientOpts = { host, port }
      }
      dhubClient = new DHubClient(clientOpts)
    }
    await dhubClient.ready()
    basestore = dhubClient.basestore()
  }

  await dhubClient.network.ready()
  const swarm = dhubClient.network
  const keyPair = dhubClient.network.keyPair

  return {
    basestore,
    swarm,
    keyPair,
    deriveSecret,
    close
  }

  async function deriveSecret (namespace, name) {
    throw new Error('Deriving secrets is not supported')
  }

  function close (cb) {
    basestore.close(cb)
  }
}

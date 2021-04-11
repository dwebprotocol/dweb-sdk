const SwarmNetworker = require('@basestore/networker')
const RAA = require('random-access-application')
const RAM = require('random-access-memory')
const DDatabaseProtocol = require('@ddatabase/protocol')
const Basestore = require('basestorex')
const SDK = require('./sdk')

const DEFAULT_SWARM_OPTS = {
  extensions: [],
  preferredPort: 42666
}
const DEFAULT_BASESTORE_OPTS = {
  sparse: true
}

module.exports = async function createSDK (opts) {
  return SDK({ ...opts, backend: nativeBackend })
}
module.exports.createBackend = nativeBackend

async function nativeBackend (opts) {
  let {
    storage,
    basestore,
    applicationName,
    persist,
    swarmOpts,
    basestoreOpts
  } = opts
  // Derive storage if it isn't provided
  // Don't derive if basestore was provided
  if (!storage && !basestore) {
    if (persist !== false) {
      storage = RAA(applicationName)
    } else {
      // Nothing should be persisted. 🤷
      storage = RAM
    }
  }

  if (!basestore) {
    basestore = new Basestore(
      storage,
      Object.assign({}, DEFAULT_BASESTORE_OPTS, basestoreOpts)
    )
  }

  // The basestore needs to be opened before creating the swarm.
  await basestore.ready()

  // I think this is used to create a persisted identity?
  // Needs to be created before the swarm so that it can be passed in
  const noiseSeed = await deriveSecret(applicationName, 'replication-keypair')
  const keyPair = DDatabaseProtocol.keyPair(noiseSeed)

  const swarm = new SwarmNetworker(basestore, Object.assign({ keyPair }, DEFAULT_SWARM_OPTS, swarmOpts))

  return {
    storage,
    basestore,
    swarm,
    deriveSecret,
    keyPair,
    close
  }

  async function deriveSecret (namespace, name) {
    return basestore.inner._deriveSecret(namespace, name)
  }

  function close (cb) {
    basestore.close(() => {
      swarm.close().then(cb, cb)
    })
  }
}

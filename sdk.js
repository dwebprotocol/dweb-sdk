const path = require('path')

// This is a dirty hack for browserify to work. 😅
if (!path.posix) path.posix = path

const DWebEncoding = require('dwebx-encoding')
const dwebdns = require('dwebx-dns')
const ddrive = require('ddrive')
const makeDDatabasePromise = require('@dwebcore/ddatabase-promise')
const makeDDrivePromise = require('@dwebcore/ddrive-promise')

const DEFAULT_DRIVE_OPTS = {
  sparse: true,
  persist: true
}
const DEFAULT_BASE_OPTS = {
  sparse: true,
  persist: true
}
const DEFAULT_DNS_OPTS = {}
const DEFAULT_APPLICATION_NAME = 'dweb-sdk'

const CLOSE_FN = Symbol('close')
const HANDLE_COUNT = Symbol('closeCount')

module.exports = SDK
module.exports.DEFAULT_APPLICATION_NAME = DEFAULT_APPLICATION_NAME

// TODO: Set up Promise API based on dBrowser https://github.com/dbrowser/dbrowser/blob/master/app/bg/web-apis/fg/ddrive.js

async function SDK (opts = {}) {
  if (!opts.backend) throw new Error('No backend was passed in')

  if (!opts.applicationName) {
    opts.applicationName = DEFAULT_APPLICATION_NAME
  }
  if (opts.persist === undefined) {
    opts.persist = true
  }

  const {
    backend,
    driveOpts,
    baseOpts,
    dnsOpts
  } = opts

  const dns = dwebdns(Object.assign({}, DEFAULT_DNS_OPTS, dnsOpts))

  const handlers = await backend(opts)
  const {
    storage,
    basestore,
    swarm,
    deriveSecret,
    keyPair
  } = handlers

  await basestore.ready()

  const drives = new Map()
  const bases = new Map()

  return {
    DDrive,
    DDatabase,
    resolveName,
    getIdentity,
    deriveSecret,
    registerExtension,
    close,
    get keyPair () { return keyPair },
    _storage: storage,
    _basestore: basestore,
    _swarm: swarm,
    _dns: dns
  }

  function getIdentity () {
    console.warn('getIdentity is being deprecated and will be removed in version 3.x.x, please use sdk.keyPair instead')
    return keyPair
  }

  function close (cb) {
    for (const drive of drives.values()) {
      drive.close()
    }

    for (const base of bases.values()) {
      base.close()
    }

    if (handlers.close) handlers.close(cb)
    else cb()
  }

  function resolveName (url, cb) {
    return dns.resolveName(url, cb)
  }

  function registerExtension (name, handlers) {
    return swarm.registerExtension(name, handlers)
  }

  function DDrive (nameOrKey, opts) {
    if (!nameOrKey) throw new Error('Must give a name or key in the constructor')

    opts = Object.assign({}, DEFAULT_DRIVE_OPTS, driveOpts, opts)

    const { key, name, id } = resolveNameOrKey(nameOrKey)

    if (drives.has(id)) {
      const existing = drives.get(id)
      existing[HANDLE_COUNT]++
      return existing
    }

    if (name) opts.namespace = name

    const drive = ddrive(basestore, key, opts)
    const wrappedDrive = makeDDrivePromise(drive)

    drive[HANDLE_COUNT] = 0

    drive[CLOSE_FN] = drive.close
    drive.close = function (fd, cb) {
      if (fd && cb) return this[CLOSE_FN](fd, cb)
      const hasHandles = wrappedDrive[HANDLE_COUNT]--
      if (hasHandles > 0) setTimeout(fd, 0)
      else setTimeout(() => this[CLOSE_FN](fd, cb), 0)
    }

    drives.set(id, wrappedDrive)

    if (!key) {
      drive.ready(() => {
        const key = drive.key
        const stringKey = key.toString('hex')
        drives.set(stringKey, wrappedDrive)
      })
    }

    drive.ready(() => {
      const {
        discoveryKey = drive.discoveryKey,
        lookup = true,
        announce = true
      } = opts
      // Don't advertise if we're not looking up or announcing
      if (!lookup && !announce) return
      swarm.configure(discoveryKey, { lookup, announce })
    })

    drive.once('close', () => {
      const key = drive.key
      const stringKey = key.toString('hex')

      drives.delete(stringKey)
      drives.delete(id)

      const { discoveryKey = drive.discoveryKey } = opts
      swarm.configure(discoveryKey, { announce: false, lookup: false })
    })

    return wrappedDrive
  }

  function DDatabase (nameOrKey, opts) {
    if (!nameOrKey) throw new Error('Must give a name or key in the constructor')

    opts = Object.assign({}, DEFAULT_BASE_OPTS, baseOpts, opts)

    const { key, name, id } = resolveNameOrKey(nameOrKey)

    if (bases.has(id)) {
      const existing = bases.get(id)
      existing[HANDLE_COUNT]++
      return existing
    }

    let base
    if (key) {
      // If a dWeb key  was provided, get it from the basestore
      base = basestore.get({ ...opts, key })
    } else {
      // If no dWeb key  was provided, but a name was given, use it as a namespace
      base = basestore.namespace(name).default(opts)
    }

    // Wrap with promises
    const wrappedBase = makeDDatabasePromise(base)

    base[HANDLE_COUNT] = 0

    base.close = function (cb) {
      if (!cb) cb = function noop () {}
      const hasHandles = wrappedBase[HANDLE_COUNT]--
      if (hasHandles === 0) {
        setTimeout(() => {
          let promise = base._close(cb)
          if (promise && promise.then) promise.then(cb, cb)
        }, 0)
      } else if (cb) setTimeout(cb, 0)
    }

    bases.set(id, wrappedBase)

    if (!key) {
      base.ready(() => {
        const key = base.key
        const stringKey = key.toString('hex')
        bases.set(stringKey, wrappedBase)
      })
    }

    base.ready(() => {
      const {
        discoveryKey = base.discoveryKey,
        lookup = true,
        announce = true
      } = opts

      // Don't advertise if we're not looking up or announcing
      if (!lookup && !announce) return
      swarm.configure(discoveryKey, { announce, lookup })
    })

    base.once('close', () => {
      const { discoveryKey = base.discoveryKey } = opts
      const key = base.key
      const stringKey = key.toString('hex')

      swarm.configure(discoveryKey, { announce: false, lookup: false })

      bases.delete(stringKey)
      bases.delete(id)
    })

    return wrappedBase
  }

  function resolveNameOrKey (nameOrKey) {
    let key, name, id
    try {
      key = DWebEncoding.decode(nameOrKey)
      id = key.toString('hex')
      // Normalize keys to be hex strings of the key instead of dWeb URLs
    } catch (e) {
      // Probably isn't a `dweb://` URL, so it must be a name
      name = nameOrKey
      id = name
    }
    return { key, name, id }
  }
}

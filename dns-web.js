/* global fetch */
// TODO: Persist to local storage

const DEFAULT_DNS_PROXY = 'gateway.dwebx.net'
const NEWLINE_REGEX = /\r?\n/
const DWEB_PROTOCOL = 'dweb://'

module.exports = ({
  dnsProxy = DEFAULT_DNS_PROXY
} = {}) => {
  let cache = {}

  return {
    async resolveName (url, opts, cb) {
      if (typeof opts === 'function') {
        cb = opts
        opts = {}
      }
      if (!cb) cb = noop

      let domain = url

      if (domain.startsWith(DWEB_PROTOCOL)) {
        domain = url.slice(DWEB_PROTOCOL.length)
      }

      if (cache[domain]) {
        if (cb) {
          cb(null, cache[domain])
          return
        } else {
          return cache[domain]
        }
      }

      try {
        const toFetch = `//${dnsProxy}/${domain}/.well-known/dweb`

        const response = await fetch(toFetch)

        const text = await response.text()

        const lines = text.split(NEWLINE_REGEX)

        const resolved = lines[0]

        const key = resolved.slice(DWEB_PROTOCOL.length)

        cache[domain] = key

        if (cb) cb(null, key)
      } catch (e) {
        if (cb) cb(e)
        else throw e
      }
    },
    listCache () {
      return cache
    },
    flushCache () {
      cache = {}
    }
  }
}

function noop () {}

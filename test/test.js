const test = require('tape')
const createNative = require('./lib/native')
const createDHub = require('./lib/dhub')
const createMixed = require('./lib/mixed')

runAll()

async function runAll () {
  await run(createNative, 'native')
  await run(createDHub, 'dhub')
  await run(createMixed, 'mixed')
}

async function run (createTestSDKs, name) {
  const { sdks, cleanup } = await createTestSDKs(2)
  const { DDrive, DDatabase, resolveName, close } = sdks[0]
  const { DDrive: DDrive2, DDatabase: DDatabase2, close: close2 } = sdks[1]

  const TEST_TIMEOUT = 60 * 1000

  const EXAMPLE_DNS_URL = 'dweb://peepsx.com'
  const EXAMPLE_DNS_RESOLUTION = '36e779f168b479b64223c6d432587e5b9be477ef89d50559ae1ea5b1dd1a108b'

  test.onFinish(() => {
    close(() => {
      close2(() => {
        setTimeout(cleanup, 100)
      })
    })
  })

  test(name + ': DDrive - create drive', (t) => {
    t.timeoutAfter(TEST_TIMEOUT)

    const drive = DDrive('Example drive 1')

    drive.writeFile('/example.txt', 'Hello World!', (err) => {
      t.error(err, 'Able to write to ddrive')

      t.end()
    })
  })

  test(name + ': DDrive - get existing drive', (t) => {
    const drive = DDrive('Example drive 2')

    drive.ready(() => {
      const existing = DDrive(drive.key)

      t.equal(existing, drive, 'Got existing drive by reference')

      t.end()
    })
  })

  test(name + ': DDrive - load drive over network', (t) => {
    t.timeoutAfter(TEST_TIMEOUT)

    const EXAMPLE_DATA = 'Hello World!'

    const drive1 = DDrive2('Example drive 3')

    drive1.writeFile('/index.html', EXAMPLE_DATA, (err) => {
      t.error(err, 'wrote to initial drive')
      const drive = DDrive(drive1.key)
      t.deepEqual(drive1.key, drive.key, 'loaded correct drive')
      drive.once('peer-open', () => {
        t.pass('Got peer for drive')
        drive.readFile('/index.html', 'utf8', (err, data) => {
          t.error(err, 'loaded file without error')
          t.equal(data, EXAMPLE_DATA)

          t.end()
        })
      })
    })
  })

  test(name + ': DDrive - new drive created after close', (t) => {
    const drive = DDrive('Example drive 5')

    drive.ready(() => {
      drive.close(() => {
        const existing = DDrive(drive.key)

        t.notOk(existing === drive, 'Got new drive by reference')

        t.end()
      })
    })
  })

  test(name + ': resolveName - resolve and load drive', (t) => {
    t.timeoutAfter(TEST_TIMEOUT)

    resolveName(EXAMPLE_DNS_URL, (err, resolved) => {
      t.error(err, 'Resolved successfully')

      t.equal(resolved, EXAMPLE_DNS_RESOLUTION)
      t.end()
    })
  })

  test(name + ': DDatabase - create', (t) => {
    t.timeoutAfter(TEST_TIMEOUT)

    const base = DDatabase('Example ddatabase 1')

    base.append('Hello World', (err) => {
      t.error(err, 'able to write to ddatabase')

      t.end()
    })
  })

  test(name + ': DDatabase - load from network', (t) => {
    t.timeoutAfter(TEST_TIMEOUT)
    t.plan(3)

    const core1 = DDatabase('Example ddatabase 2')

    core1.append('Hello World', () => {
      const core2 = DDatabase2(core1.key)

      core2.ready(() => {
        t.deepEqual(core2.key, core1.key, 'loaded key correctly')
      })

      core2.once('peer-open', () => {
        core2.get(0, (err, data) => {
          t.error(err, 'no error reading from base')
          t.ok(data, 'got data from replicated base')

          t.end()
        })
      })
    })
  })

  test(name + ': DDatabase - only close when all handles are closed', (t) => {
    t.timeoutAfter(TEST_TIMEOUT)
    t.plan(5)

    const core1 = DDatabase('Example ddatabase 4')
    const core2 = DDatabase('Example ddatabase 4')

    core1.once('close', () => t.pass('close event emitted once'))

    t.ok(core1 === core2, 'Second handle is same instance')

    core1.append('Hello World', () => {
      core1.close(() => {
        t.pass('First base closed')
        core1.get(0, (err) => {
          t.error(err, 'Still able to read after close')
          core2.close(() => {
            t.pass('Second base closed')
          })
        })
      })
    })
  })
}

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const run = promisify(execFile)

test(
  'packed registry installs and serves its bundled catalog outside the repo',
  { timeout: 180_000 },
  async (t) => {
    const npmCli = process.env.npm_execpath
    assert.ok(npmCli, 'Run this check with npm run test:package')
    const repo = resolve('.')
    const packageDir = resolve('packages/mcp-server')
    const temporary = await mkdtemp(join(tmpdir(), 'agentforge-release-'))
    assert.ok(
      relative(repo, temporary).startsWith('..'),
      'Install must be outside the repository',
    )
    const installDir = join(temporary, 'consumer')
    await mkdir(installDir)
    const npm = (args: string[], cwd: string) =>
      run(process.execPath, [npmCli, ...args], {
        cwd,
        windowsHide: true,
        timeout: 120_000,
        maxBuffer: 4 * 1024 * 1024,
      })
    try {
      const packed = await npm(
        ['pack', '--json', '--pack-destination', temporary],
        packageDir,
      )
      // npm can print prepack lifecycle output before the JSON result.
      const [pack] = JSON.parse(
        packed.stdout.slice(packed.stdout.search(/^\[/m)),
      ) as {
        filename: string
        files: { path: string }[]
      }[]
      const paths = pack.files.map((file) => file.path).sort()
      for (const required of [
        'README.md',
        'catalog.json',
        'dist/cli.js',
        'package.json',
      ]) {
        assert.ok(paths.includes(required), `Missing ${required}`)
      }
      assert.ok(
        paths.every(
          (path) =>
            path.startsWith('dist/') ||
            ['README.md', 'catalog.json', 'package.json', 'LICENSE'].includes(
              path,
            ),
        ),
        'Tarball must contain only the runtime distribution, catalog, and package documentation',
      )
      t.diagnostic(`npm pack: ${pack.filename}; files: ${paths.join(', ')}`)

      const tarball = join(temporary, pack.filename)
      // A minimal consumer manifest keeps npm from finding any ancestor project.
      await writeFile(
        join(installDir, 'package.json'),
        JSON.stringify({ name: 'registry-release-smoke', private: true }),
      )
      const installed = await npm(
        ['install', '--omit=dev', '--no-audit', '--no-fund', tarball],
        installDir,
      )
      t.diagnostic(`npm install ${pack.filename}: ${installed.stdout.trim()}`)
      const installedPackage = join(
        installDir,
        'node_modules',
        'agentforge-registry',
      )
      const manifest = JSON.parse(
        await readFile(join(installedPackage, 'package.json'), 'utf8'),
      )
      assert.equal(manifest.name, 'agentforge-registry')
      assert.equal(manifest.dependencies.agentforge, undefined)
      for (const version of Object.values(manifest.dependencies) as string[]) {
        assert.doesNotMatch(version, /^(?:file:|link:|workspace:|\.|\/)/)
      }
      const executable = join(
        installedPackage,
        manifest.bin['agentforge-registry'],
      )
      const catalog = join(installedPackage, 'catalog.json')
      const pin = 'postgres-index-tuner@1.0.0'
      for (const mode of [
        'explicit bundled catalog',
        'offline default fallback',
      ] as const) {
        const args =
          mode === 'explicit bundled catalog'
            ? [executable, '--agent', pin, '--catalog', catalog]
            : [
                '--import',
                `data:text/javascript,${encodeURIComponent("globalThis.fetch = async () => { throw new Error('offline') }")}`,
                executable,
                '--agent',
                pin,
              ]
        const transport = new StdioClientTransport({
          command: process.execPath,
          args,
          cwd: installDir,
          stderr: 'pipe',
        })
        const client = new Client({ name: 'release-smoke', version: '1.0.0' })
        try {
          await client.connect(transport)
          assert.match(
            client.getInstructions() ?? '',
            /PostgreSQL performance engineer/,
          )
          assert.ok(
            (await client.listTools()).tools.some(
              (tool) => tool.name === 'agent_postgres_index_tuner',
            ),
          )
          const resource = await client.readResource({
            uri: 'agentforge://active/manifest',
          })
          const active = JSON.parse(
            (resource.contents[0] as { text: string }).text,
          )
          assert.equal(active.id, 'postgres-index-tuner')
          assert.equal(active.version, '1.0.0')
          const invalid = await client.callTool({
            name: 'agent_postgres_index_tuner',
            arguments: {},
          })
          assert.equal(
            invalid.isError,
            true,
            'Bundled validator must reject invalid input',
          )
          t.diagnostic(
            `installed binary --agent ${pin}: MCP initialize, tools, manifest, and validation passed (${mode})`,
          )
        } finally {
          await client.close()
        }
      }
    } finally {
      assert.equal(dirname(temporary), resolve(tmpdir()))
      assert.ok(
        temporary.startsWith(join(resolve(tmpdir()), 'agentforge-release-')),
      )
      await rm(temporary, { recursive: true, force: true })
    }
  },
)

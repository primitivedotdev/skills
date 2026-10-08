// The repository ships two plugin manifests: the Agent Plugins one at the root
// (plugin.json + mcp.json) and the Claude Code one under .claude-plugin/. They
// describe the same plugin, so fail when they disagree instead of letting one
// host install a stale version or a different set of MCP servers.
import { readFileSync } from 'node:fs'

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))

const agentPlugin = read('plugin.json')
const agentMcp = read('mcp.json')
const claudePlugin = read('.claude-plugin/plugin.json')
const claudeMarketplace = read('.claude-plugin/marketplace.json')

const problems = []

for (const field of ['name', 'version', 'description']) {
  if (agentPlugin[field] !== claudePlugin[field]) {
    problems.push(`${field} differs between plugin.json and .claude-plugin/plugin.json`)
  }
}

const serverUrls = (servers) =>
  JSON.stringify(Object.entries(servers ?? {}).map(([name, server]) => [name, server.url]).sort())
if (serverUrls(agentMcp.mcpServers) !== serverUrls(claudePlugin.mcpServers)) {
  problems.push('MCP servers differ between mcp.json and .claude-plugin/plugin.json')
}

// Claude Code names the streamable HTTP transport "http".
for (const [name, server] of Object.entries(claudePlugin.mcpServers ?? {})) {
  if (server.type !== 'http') {
    problems.push(`.claude-plugin/plugin.json server "${name}" must use type "http"`)
  }
}

const listed = (claudeMarketplace.plugins ?? []).find((plugin) => plugin.name === claudePlugin.name)
if (!listed) {
  problems.push(`.claude-plugin/marketplace.json does not list the "${claudePlugin.name}" plugin`)
} else if (listed.description !== claudePlugin.description) {
  problems.push('description differs between .claude-plugin/marketplace.json and .claude-plugin/plugin.json')
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}
console.log('Plugin manifests agree.')

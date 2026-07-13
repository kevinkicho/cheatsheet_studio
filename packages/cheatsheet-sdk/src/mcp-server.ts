/**
 * Minimal JSON-RPC MCP-style stdio server for coding agents.
 * Protocol subset: initialize, tools/list, tools/call (no full MCP SDK dep).
 *
 *   npm run cheatsheet -- mcp
 *
 * Tools map to the same SDK/CLI operations (compose, validate, catalog, write).
 */
import { createSheet, SheetBuilder } from './builder'
import { searchCatalog, findCatalogItem } from './catalog'
import { appendOutlineToSheet, composeFromOutline } from './compose'
import type { SheetOutline } from './outline'
import { readSheetFile, writeSheetFile, summarizeSheet } from './io'
import { validateSheetDocument } from './validate'
import { createInterface } from 'node:readline'

type JsonRpcReq = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

type ToolDef = {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: ToolDef[] = [
  {
    name: 'cheatsheet_compose',
    description:
      'Compose a CheatSheet Studio sheet from a high-level outline and write JSON to disk',
    inputSchema: {
      type: 'object',
      properties: {
        outline: {
          type: 'object',
          description:
            'SheetOutline: { title, blocks: equation|table|process|figure|heading|catalog[] }',
        },
        outPath: { type: 'string', description: 'Output .sheet.json path' },
      },
      required: ['outline', 'outPath'],
    },
  },
  {
    name: 'cheatsheet_validate',
    description: 'Validate a sheet JSON file structure',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'cheatsheet_catalog_search',
    description: 'Search Studio seed catalog for equations/tables/figures',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: {
          type: 'string',
          enum: ['all', 'equation', 'table', 'figure'],
        },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'cheatsheet_add_catalog',
    description: 'Append a seed catalog item to an existing sheet file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        idOrTitle: { type: 'string' },
      },
      required: ['path', 'idOrTitle'],
    },
  },
  {
    name: 'cheatsheet_init',
    description: 'Create an empty sheet JSON file',
    inputSchema: {
      type: 'object',
      properties: {
        outPath: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['outPath'],
    },
  },
  {
    name: 'cheatsheet_summarize',
    description: 'One-line summary of a sheet file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'cheatsheet_list_packs',
    description: 'List premade topic packs (calc, finance, physics, stats, …)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cheatsheet_compose_pack',
    description: 'Compose a premade topic pack into a sheet JSON file',
    inputSchema: {
      type: 'object',
      properties: {
        packId: {
          type: 'string',
          description:
            'e.g. calc-derivatives, lin-algebra, finance-capm, physics-kinematics, chem-stoichiometry, stats-bayes, econ-elasticity',
        },
        outPath: { type: 'string' },
      },
      required: ['packId', 'outPath'],
    },
  },
  {
    name: 'cheatsheet_append_outline',
    description:
      'Append outline blocks to an existing sheet JSON file and re-layout',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Existing sheet.json path' },
        outline: {
          type: 'object',
          description: '{ blocks: [...], autoLayout?: boolean, notes?: string }',
        },
      },
      required: ['path', 'outline'],
    },
  },
  {
    name: 'cheatsheet_push',
    description:
      'Push sheet JSON to Firestore (requires CHEATSHEET_SA_PATH + CHEATSHEET_UID env, or args)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        uid: { type: 'string', description: 'Owner Firebase uid (or env)' },
        saPath: {
          type: 'string',
          description: 'Service account JSON path (or CHEATSHEET_SA_PATH)',
        },
        sheetId: {
          type: 'string',
          description: 'Update existing sheet id (optional)',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'cheatsheet_pull',
    description:
      'Pull a Firestore sheet to a local JSON file (requires CHEATSHEET_SA_PATH)',
    inputSchema: {
      type: 'object',
      properties: {
        sheetId: { type: 'string' },
        outPath: { type: 'string' },
        saPath: { type: 'string' },
      },
      required: ['sheetId', 'outPath'],
    },
  },
]

function respond(id: string | number | null | undefined, result: unknown) {
  const msg = {
    jsonrpc: '2.0',
    id: id ?? null,
    result,
  }
  process.stdout.write(JSON.stringify(msg) + '\n')
}

function respondError(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  process.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code, message },
    }) + '\n',
  )
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case 'cheatsheet_init': {
      const outPath = String(args.outPath ?? '')
      const title = String(args.title ?? 'Untitled sheet')
      const sheet = createSheet({
        title,
        meta: { createdBy: 'mcp', source: 'mcp-server' },
      }).build()
      writeSheetFile(outPath, sheet)
      return { ok: true, path: outPath, summary: summarizeSheet(sheet) }
    }
    case 'cheatsheet_compose': {
      const outline = args.outline as SheetOutline
      const outPath = String(args.outPath ?? '')
      if (!outline?.title || !Array.isArray(outline.blocks)) {
        throw new Error('outline.title and outline.blocks required')
      }
      const sheet = await composeFromOutline(outline)
      writeSheetFile(outPath, sheet)
      return { ok: true, path: outPath, summary: summarizeSheet(sheet) }
    }
    case 'cheatsheet_validate': {
      const path = String(args.path ?? '')
      const doc = readSheetFile(path)
      const v = validateSheetDocument(doc)
      return v.ok
        ? { ok: true, summary: summarizeSheet(v.sheet) }
        : { ok: false, issues: v.issues }
    }
    case 'cheatsheet_catalog_search': {
      const hits = await searchCatalog({
        query: args.query ? String(args.query) : '',
        type:
          args.type === 'equation' ||
          args.type === 'table' ||
          args.type === 'figure'
            ? args.type
            : 'all',
        limit: typeof args.limit === 'number' ? args.limit : 15,
      })
      return {
        ok: true,
        results: hits.map((h) => ({
          id: h.id,
          type: h.type,
          title: h.title,
          topic: h.topic,
          subject: h.subject,
        })),
      }
    }
    case 'cheatsheet_add_catalog': {
      const path = String(args.path ?? '')
      const idOrTitle = String(args.idOrTitle ?? '')
      const item = await findCatalogItem(idOrTitle)
      if (!item) throw new Error(`Catalog not found: ${idOrTitle}`)
      const next = await SheetBuilder.fromDocument(readSheetFile(path))
        .addFromCatalog(idOrTitle)
        .then((b) => b.build())
      writeSheetFile(path, next)
      return {
        ok: true,
        added: item.id,
        title: item.title,
        summary: summarizeSheet(next),
      }
    }
    case 'cheatsheet_summarize': {
      const path = String(args.path ?? '')
      return { ok: true, summary: summarizeSheet(readSheetFile(path)) }
    }
    case 'cheatsheet_list_packs': {
      const { listTopicPacks } = await import('./topic-packs')
      return { ok: true, packs: listTopicPacks() }
    }
    case 'cheatsheet_compose_pack': {
      const packId = String(args.packId ?? '')
      const outPath = String(args.outPath ?? '')
      const { composeTopicPack } = await import('./topic-packs')
      const sheet = await composeTopicPack(packId)
      writeSheetFile(outPath, sheet)
      return { ok: true, path: outPath, summary: summarizeSheet(sheet) }
    }
    case 'cheatsheet_append_outline': {
      const path = String(args.path ?? '')
      const outline = args.outline as Pick<
        SheetOutline,
        'blocks' | 'autoLayout' | 'notes'
      >
      if (!outline?.blocks || !Array.isArray(outline.blocks)) {
        throw new Error('outline.blocks array required')
      }
      const next = await appendOutlineToSheet(readSheetFile(path), outline)
      writeSheetFile(path, next)
      return { ok: true, path, summary: summarizeSheet(next) }
    }
    case 'cheatsheet_push': {
      const { resolveCloudAuth, requireOwnerUid } = await import('./auth')
      const { pushSheetToFirestore } = await import('./firebase-push')
      const path = String(args.path ?? '')
      const auth = resolveCloudAuth({
        sa: args.saPath ? String(args.saPath) : undefined,
        uid: args.uid ? String(args.uid) : undefined,
        sheetId: args.sheetId ? String(args.sheetId) : undefined,
      })
      const uid = requireOwnerUid(auth)
      const r = await pushSheetToFirestore(readSheetFile(path), {
        ownerId: uid,
        serviceAccountPath: auth.serviceAccountPath,
        sheetId: auth.defaultSheetId,
        projectId: auth.projectId,
      })
      return {
        ok: true,
        sheetId: r.sheetId,
        created: r.created,
        message: r.created
          ? 'Created Firestore sheet — open My Sheets in Studio'
          : 'Updated Firestore sheet',
      }
    }
    case 'cheatsheet_pull': {
      const { resolveCloudAuth } = await import('./auth')
      const { pullSheetFromFirestore } = await import('./firebase-pull')
      const auth = resolveCloudAuth({
        sa: args.saPath ? String(args.saPath) : undefined,
        sheetId: args.sheetId ? String(args.sheetId) : undefined,
      })
      const sheetId = String(args.sheetId ?? auth.defaultSheetId ?? '')
      const outPath = String(args.outPath ?? '')
      if (!sheetId) throw new Error('sheetId required (or CHEATSHEET_SHEET_ID)')
      const doc = await pullSheetFromFirestore({
        sheetId,
        serviceAccountPath: auth.serviceAccountPath,
        projectId: auth.projectId,
      })
      writeSheetFile(outPath, doc)
      return { ok: true, path: outPath, summary: summarizeSheet(doc) }
    }
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}

/**
 * Line-delimited JSON-RPC over stdin/stdout.
 */
export async function startMcpServer(): Promise<void> {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })

  // Advertise on stderr so agents know we're up (stdout is protocol)
  console.error(
    '[cheatsheet-mcp] ready — tools: ' + TOOLS.map((t) => t.name).join(', '),
  )

  for await (const line of rl) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let req: JsonRpcReq
    try {
      req = JSON.parse(trimmed) as JsonRpcReq
    } catch {
      respondError(null, -32700, 'Parse error')
      continue
    }

    const id = req.id
    const method = req.method ?? ''

    try {
      if (method === 'initialize') {
        respond(id, {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'cheatsheet-studio', version: '0.1.0' },
          capabilities: { tools: {} },
        })
        continue
      }
      if (method === 'notifications/initialized' || method === 'initialized') {
        continue
      }
      if (method === 'tools/list') {
        respond(id, { tools: TOOLS })
        continue
      }
      if (method === 'tools/call') {
        const params = req.params ?? {}
        const name = String(params.name ?? '')
        const args = (params.arguments ?? params.args ?? {}) as Record<
          string,
          unknown
        >
        const result = await callTool(name, args)
        respond(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        })
        continue
      }
      if (method === 'ping') {
        respond(id, {})
        continue
      }
      respondError(id, -32601, `Method not found: ${method}`)
    } catch (e) {
      respondError(id, -32000, e instanceof Error ? e.message : String(e))
    }
  }
}

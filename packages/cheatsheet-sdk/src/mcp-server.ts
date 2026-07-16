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
    description:
      'Search Studio blocks: equations, tables, figures, process charts (flowchart/mindmap)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        type: {
          type: 'string',
          enum: ['all', 'equation', 'table', 'figure', 'process'],
        },
        processKind: {
          type: 'string',
          enum: ['all', 'flowchart', 'mindmap'],
        },
        subject: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'cheatsheet_list_blocks',
    description:
      'List Studio blocks filtered by type (equation|table|figure|definition|list|callout|code|constant|identity-set|plot|matrix|process)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: [
            'all',
            'equation',
            'table',
            'figure',
            'definition',
            'list',
            'callout',
            'code',
            'constant',
            'identity-set',
            'plot',
            'matrix',
            'process',
          ],
        },
        processKind: {
          type: 'string',
          enum: ['all', 'flowchart', 'mindmap'],
        },
        subject: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'cheatsheet_add_catalog',
    description:
      'Append one or more Studio blocks (equation/figure/process id) to a sheet file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        idOrTitle: {
          type: 'string',
          description: 'Single block id, e.g. math-quad or proc-npv-screen',
        },
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Multiple block ids',
        },
      },
      required: ['path'],
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
    inputSchema: {
      type: 'object',
      properties: {
        subject: {
          type: 'string',
          description: 'Filter e.g. mathematics, finance, physics',
        },
      },
    },
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
  {
    name: 'cheatsheet_doctor',
    description: 'Health-check SDK (packs, catalog, optional cloud env)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cheatsheet_merge',
    description: 'Merge multiple sheet JSON files into one (re-layout)',
    inputSchema: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Input sheet.json paths',
        },
        outPath: { type: 'string' },
        title: { type: 'string' },
      },
      required: ['paths', 'outPath'],
    },
  },
  {
    name: 'cheatsheet_export_html',
    description: 'Export sheet JSON to print HTML',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        outPath: { type: 'string' },
        light: { type: 'boolean' },
      },
      required: ['path', 'outPath'],
    },
  },
  {
    name: 'cheatsheet_export_pdf',
    description:
      'Export sheet JSON to PDF via Playwright (npx playwright install chromium)',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        outPath: { type: 'string' },
        light: { type: 'boolean' },
        keepHtml: { type: 'boolean' },
      },
      required: ['path', 'outPath'],
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
    case 'cheatsheet_catalog_search':
    case 'cheatsheet_list_blocks': {
      const typeArg = args.type
      const known = new Set([
        'equation',
        'table',
        'figure',
        'definition',
        'list',
        'callout',
        'code',
        'constant',
        'identity-set',
        'plot',
        'matrix',
        'process',
      ])
      const type =
        typeof typeArg === 'string' && known.has(typeArg)
          ? (typeArg as import('./catalog').CatalogBlockType)
          : 'all'
      const pk = args.processKind
      const processKind =
        pk === 'flowchart' || pk === 'mindmap' ? pk : 'all'
      const hits = await searchCatalog({
        query: args.query ? String(args.query) : '',
        type,
        processKind,
        subject: args.subject ? String(args.subject) : undefined,
        limit: typeof args.limit === 'number' ? args.limit : 25,
      })
      return {
        ok: true,
        results: hits.map((h) => ({
          id: h.id,
          type: h.type,
          title: h.title,
          topic: h.topic,
          subject: h.subject,
          mermaidKind: h.mermaidKind,
          tags: h.tags,
        })),
      }
    }
    case 'cheatsheet_add_catalog': {
      const path = String(args.path ?? '')
      const ids: string[] = []
      if (args.idOrTitle) ids.push(String(args.idOrTitle))
      if (Array.isArray(args.ids)) {
        for (const x of args.ids) ids.push(String(x))
      }
      if (ids.length === 0) {
        throw new Error('idOrTitle or ids required')
      }
      let builder = SheetBuilder.fromDocument(readSheetFile(path))
      const added: { id: string; type: string; title: string }[] = []
      for (const id of ids) {
        const item = await findCatalogItem(id)
        if (!item) throw new Error(`Block not found: ${id}`)
        builder = await builder.addFromCatalog(id)
        added.push({ id: item.id, type: item.type, title: item.title })
      }
      const next = builder.autoLayout().build()
      writeSheetFile(path, next)
      return {
        ok: true,
        added,
        summary: summarizeSheet(next),
      }
    }
    case 'cheatsheet_summarize': {
      const path = String(args.path ?? '')
      return { ok: true, summary: summarizeSheet(readSheetFile(path)) }
    }
    case 'cheatsheet_list_packs': {
      const { listTopicPacks } = await import('./topic-packs')
      const subject = args.subject ? String(args.subject) : undefined
      return { ok: true, packs: listTopicPacks({ subject }) }
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
    case 'cheatsheet_doctor': {
      const { runDoctor } = await import('./doctor')
      return runDoctor()
    }
    case 'cheatsheet_merge': {
      const { mergeSheets } = await import('./merge')
      const paths = args.paths as string[]
      const outPath = String(args.outPath ?? '')
      if (!Array.isArray(paths) || paths.length < 2) {
        throw new Error('paths must be an array of ≥2 sheet files')
      }
      const sheets = paths.map((p) => readSheetFile(p))
      const merged = mergeSheets(sheets, {
        title: args.title ? String(args.title) : undefined,
      })
      writeSheetFile(outPath, merged)
      return { ok: true, path: outPath, summary: summarizeSheet(merged) }
    }
    case 'cheatsheet_export_html': {
      const { writeSheetHtml } = await import('./export-print')
      const path = String(args.path ?? '')
      const outPath = String(args.outPath ?? '')
      const abs = writeSheetHtml(readSheetFile(path), outPath, {
        dark: args.light !== true,
      })
      return { ok: true, path: abs }
    }
    case 'cheatsheet_export_pdf': {
      const { exportSheetPdf } = await import('./export-print')
      const path = String(args.path ?? '')
      const outPath = String(args.outPath ?? '')
      const r = await exportSheetPdf(readSheetFile(path), outPath, {
        dark: args.light !== true,
        keepHtml: args.keepHtml === true,
      })
      return { ok: true, ...r }
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

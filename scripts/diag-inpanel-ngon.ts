import { relayoutPanelContents, packCheatsheetLayout } from './src/lib/autoOrganize'
import { readFileSync } from 'fs'

const sheet = JSON.parse(readFileSync('examples/agent-out/everything.sheet.json','utf8'))
const packed = packCheatsheetLayout(sheet.items, { ...sheet.canvas, dissolvePrintArea: true, printPageCount: 8 }, {
  density: 'sm', multiPage: true, folders: sheet.folders, fitPrint: true, dissolvePrintArea: true,
  groupChrome: 'panels', panelShape: 'rect', panelGroupLevels: [1,2,3], panelBorderLevels: [1,2,3],
  groupSort: 'name-asc', gap: 4, panelPadding: 4,
})
const panels = packed.layoutPanels ?? []
const bio = panels.find(p => (p.hierarchyLevel??1)===1 && /Biology/i.test(p.title||''))
if (!bio) { console.log('no bio'); process.exit(1) }
const l2before = panels.filter(p => (p.hierarchyLevel??1)===2 && p.memberIds?.every(id => bio.memberIds?.includes(id)))
console.log('before L2 shapes', l2before.map(p => ({ t: p.title, shape: p.shape, runs: p.runs?.length, poly: !!p.outlinePath })))

const { items, panel, panels: next } = relayoutPanelContents(packed.items, bio, {
  mode: 'dense', gapPx: 4, panelPad: 4, grid: 24, packSeed: 0, panelShape: 'polygon', allPanels: panels,
})
const l2 = (next??[]).filter(p => (p.hierarchyLevel??1)===2 && p.memberIds?.every(id => panel.memberIds?.includes(id)))
console.log('after root', { shape: panel.shape, runs: panel.runs?.length, outline: panel.outlinePath?.slice(0,40) })
console.log('after L2', l2.map(p => ({ t: p.title?.slice(0,24), shape: p.shape, runs: p.runs?.length, outline: !!p.outlinePath })))

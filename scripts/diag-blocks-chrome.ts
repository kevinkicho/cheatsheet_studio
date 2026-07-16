import { chromeFromMembers } from './src/lib/autoOrganize/polyomino'
// Genetics-like L: tall left + short top-right
const members = [
  { x: 100, y: 100, width: 140, height: 280 },
  { x: 250, y: 100, width: 160, height: 80 },
]
const chrome = chromeFromMembers(members, {
  pad: 4, titleBand: 16, shape: 'polygon', grid: 24, solidMode: 'blocks',
})
console.log({ runs: chrome.runs?.length, runsDetail: chrome.runs, w: chrome.width, h: chrome.height })

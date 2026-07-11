import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MarkdownTable, parsePipeTable } from './MarkdownTable'

afterEach(() => cleanup())

const SAMPLE = `
| Name | Value |
|------|-------|
| pi   | 3.14  |
| e    | 2.71  |
`

describe('parsePipeTable', () => {
  it('parses header and body, drops separator', () => {
    const rows = parsePipeTable(SAMPLE)
    expect(rows).toEqual([
      ['Name', 'Value'],
      ['pi', '3.14'],
      ['e', '2.71'],
    ])
  })

  it('handles empty input', () => {
    expect(parsePipeTable('')).toEqual([])
    expect(parsePipeTable('   ')).toEqual([])
  })
})

describe('MarkdownTable component', () => {
  it('renders header and cells', () => {
    render(<MarkdownTable markdown={SAMPLE} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('pi')).toBeInTheDocument()
    expect(screen.getByText('3.14')).toBeInTheDocument()
  })

  it('shows empty state', () => {
    render(<MarkdownTable markdown="" />)
    expect(screen.getByText('Empty table')).toBeInTheDocument()
  })
})

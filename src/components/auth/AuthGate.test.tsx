import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthGate } from './AuthGate'
import { useAuthStore } from '@/stores/authStore'

describe('AuthGate', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, loading: false, error: null })
  })

  afterEach(() => {
    cleanup()
  })

  it('shows loading state', () => {
    useAuthStore.setState({ loading: true })
    render(
      <MemoryRouter>
        <AuthGate>
          <div>secret</div>
        </AuthGate>
      </MemoryRouter>,
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('secret')).toBeNull()
  })

  it('redirects unauthenticated users to landing', () => {
    useAuthStore.setState({ loading: false, user: null })
    render(
      <MemoryRouter initialEntries={['/app']}>
        <Routes>
          <Route
            path="/app"
            element={
              <AuthGate>
                <div>workspace</div>
              </AuthGate>
            }
          />
          <Route path="/" element={<div>landing</div>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('landing')).toBeInTheDocument()
    expect(screen.queryByText('workspace')).toBeNull()
  })

  it('renders children when signed in', () => {
    useAuthStore.setState({
      loading: false,
      user: { uid: 'u1' } as never,
    })
    render(
      <MemoryRouter>
        <AuthGate>
          <div>workspace-ok</div>
        </AuthGate>
      </MemoryRouter>,
    )
    expect(screen.getByText('workspace-ok')).toBeInTheDocument()
  })
})

import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from '@/components/auth/AuthGate'
import { Landing } from '@/pages/Landing'
import { Workspace } from '@/pages/Workspace'
import { useAuthStore } from '@/stores/authStore'

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => {
    return init()
  }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route
          path="/app"
          element={
            <AuthGate>
              <Workspace />
            </AuthGate>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

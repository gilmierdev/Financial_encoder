import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import UpdateBanner from '../update/UpdateBanner'

function AppShell(): React.JSX.Element {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="app-shell__main">
        <TopBar />
        <UpdateBanner />
        <main className="app-shell__content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AppShell
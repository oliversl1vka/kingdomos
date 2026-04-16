import { Routes, Route, NavLink } from 'react-router-dom';
import AgentsPage from './pages/AgentsPage.tsx';
import './styles/app.css';

export default function App() {
  return (
    <div className="app">
      <nav className="app-nav">
        <span className="app-nav-logo">👑 KingdomOS</span>
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
          Kingdom
        </NavLink>
        <NavLink to="/agents" className={({ isActive }) => isActive ? 'active' : ''}>
          Agents
        </NavLink>
      </nav>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<KingdomHome />} />
          <Route path="/agents" element={<AgentsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function KingdomHome() {
  return (
    <div className="home">
      <h1>Welcome to KingdomOS</h1>
      <p>Navigate to <strong>Agents</strong> to see the agent orchestration map.</p>
    </div>
  );
}

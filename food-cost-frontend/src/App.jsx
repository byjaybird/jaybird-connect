import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate,
  useLocation
} from 'react-router-dom';
import Logo from './assets/logo.png';
import EditItem from './EditItem';
import IngredientsPage from './IngredientsPage';
import IngredientDetail from './IngredientDetail';
import NewItemPage from './NewItemPage';
import ItemsLanding from './ItemsLanding';
import ItemDetail from './ItemDetail';
import EditIngredient from './EditIngredient'; 
import NewPriceQuoteForm from './NewPriceQuoteForm';
import Prices from './Prices';
import InventoryDashboard from './InventoryDashboard';
import InventoryScanner from './InventoryScanner';
import NewReceivingForm from './NewReceivingForm';
import TasksPage from './components/TasksPage';
import UserManagement from './components/UserManagement';
import Login from './components/auth/Login';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import ShiftSchedulePlanner from './components/ShiftSchedulePlanner';
import ShiftPatternConfigurator from './components/ShiftPatternConfigurator';
import EmployeeDashboard from './components/EmployeeDashboard';
import ShiftManager from './components/ShiftManager';
import Dashboard from './Dashboard.jsx';
import { API_URL } from './config';

function Header({ user, onLogout }) {
  const location = useLocation();
  const path = location.pathname;
  let mainSection = 'dashboard';
  if (path.startsWith('/menu') || path.startsWith('/ingredients')) mainSection = 'menu';
  else if (path.startsWith('/prices')) mainSection = 'prices';
  else if (path.startsWith('/inventory')) mainSection = 'inventory';
  else if (path.startsWith('/users')) mainSection = 'users';
  else if (path.startsWith('/shifts')) mainSection = 'shifts';
  else if (path.startsWith('/tasks')) mainSection = 'tasks';

  const subNavItems = [];
  if (mainSection === 'menu') {
    subNavItems.push({ href: '/menu', label: 'Menu' });
    subNavItems.push({ href: '/ingredients', label: 'Ingredients' });
  } else if (mainSection === 'prices') {
    subNavItems.push({ href: '/prices', label: 'Prices' });
  } else if (mainSection === 'inventory') {
    subNavItems.push({ href: '/inventory', label: 'Inventory' });
  } else if (mainSection === 'users') {
    subNavItems.push({ href: '/users', label: 'User Management' });
  } else if (mainSection === 'shifts') {
    subNavItems.push({ href: '/shifts', label: 'Shifts' });
    subNavItems.push({ href: '/shifts/patterns', label: 'Shift Patterns' });
    subNavItems.push({ href: '/shifts/manager', label: 'Shift Manager' });
  } else if (mainSection === 'tasks') {
    subNavItems.push({ href: '/tasks', label: 'Tasks' });
  }

  return (
    <header className="bg-white shadow-md py-4 px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link to="/">
            <img src={Logo} alt="Jaybird Connect logo" className="h-10" />
          </Link>
          <Link to="/menu" className="text-sm font-semibold text-gray-700 hover:text-black">Menu</Link>
          <Link to="/prices" className="text-sm font-semibold text-gray-700 hover:text-black">Prices</Link>
          <Link to="/inventory" className="text-sm font-semibold text-gray-700 hover:text-black">Inventory</Link>
          {user?.role === 'Admin' && (
            <>
              <Link to="/users" className="text-sm font-semibold text-gray-700 hover:text-black">Users</Link>
              <Link to="/shifts" className="text-sm font-semibold text-gray-700 hover:text-black">Shifts</Link>
              <Link to="/tasks" className="text-sm font-semibold text-gray-700 hover:text-black">Tasks</Link>
            </>
          )}
          {user?.role !== 'Admin' && user && (
            <>
              <Link to="/shifts" className="text-sm font-semibold text-gray-700 hover:text-black">Shifts</Link>
              <Link to="/tasks" className="text-sm font-semibold text-gray-700 hover:text-black">Tasks</Link>
            </>
          )}
        </div>
        {user && (
          <div className="flex items-center space-x-4">
            <span className="font-medium text-gray-600">{user.name}</span>
            <button onClick={onLogout} className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded transition">Logout</button>
          </div>
        )}
      </div>
      {subNavItems.length > 0 && (
        <nav className="mt-3 border-t border-gray-200 pt-2">
          <div className="flex space-x-4 justify-start">
            {subNavItems.map((s) => {
              const isActive = location.pathname.startsWith(s.href);
              return (
                <Link key={s.href} to={s.href} className={`text-sm font-semibold ${isActive ? 'text-black' : 'text-gray-600 hover:text-black'}`}>{s.label}</Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" />;
}

function App() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetch(`${API_URL}/auth/check`, {
        headers: { 
          'Authorization': `Bearer ${token}`
        }
      })
      .then(res => res.json())
      .then(data => {
        if (data.status === 'valid') {
          setUser(data.user);
        } else {
          handleLogout();
        }
      })
      .catch(() => {
        handleLogout();
      });
    }
  }, []);
  const handleLogout = () => {
    localStorage.removeItem('token');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <Router>
      <Header user={user} onLogout={handleLogout} />
      <Routes>
        <Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Dashboard is root for all users */}
        <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />

        {/* Main nav structure routes */}
        <Route path="/menu" element={<PrivateRoute><ItemsLanding /></PrivateRoute>} />
        <Route path="/ingredients" element={<PrivateRoute><IngredientsPage /></PrivateRoute>} />
        <Route path="/prices" element={<PrivateRoute><Prices /></PrivateRoute>} />
        <Route path="/inventory" element={<PrivateRoute><InventoryDashboard /></PrivateRoute>} />
        <Route path="/users" element={<PrivateRoute><UserManagement /></PrivateRoute>} />
        <Route path="/shifts" element={<PrivateRoute><EmployeeDashboard /></PrivateRoute>} />
        <Route path="/shifts/patterns" element={<PrivateRoute><ShiftPatternConfigurator /></PrivateRoute>} />
        <Route path="/shifts/manager" element={<PrivateRoute><ShiftManager /></PrivateRoute>} />
        <Route path="/tasks" element={<PrivateRoute><TasksPage user={user} /></PrivateRoute>} />

        {/* Other routes */}
        <Route path="/item/:id" element={<PrivateRoute><ItemDetail /></PrivateRoute>} />
        <Route path="/item/:id/edit" element={<PrivateRoute><EditItem /></PrivateRoute>} />
        <Route path="/item/new" element={<PrivateRoute><NewItemPage /></PrivateRoute>} />
        <Route path="/ingredients/:id" element={<PrivateRoute><IngredientDetail /></PrivateRoute>} />
        <Route path="/ingredients/:id/edit" element={<PrivateRoute><EditIngredient /></PrivateRoute>} />
        <Route path="/prices/new" element={<PrivateRoute><NewPriceQuoteForm /></PrivateRoute>} />
        <Route path="/inventory-scanner" element={<PrivateRoute><InventoryScanner /></PrivateRoute>} />
        <Route path="/receiving/new" element={<PrivateRoute><NewReceivingForm /></PrivateRoute>} />
      </Routes>
    </Router>
  );
}

export default App;


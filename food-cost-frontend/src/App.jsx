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
import ManualInventoryPage from './ManualInventoryPage';
import InventoryScanner from './InventoryScanner';
import NewReceivingForm from './NewReceivingForm';
import TasksPage from './components/TasksPage';
import UserManagement from './components/UserManagement';
import Login from './components/auth/Login';
import ForgotPassword from './components/auth/ForgotPassword';
import ResetPassword from './components/auth/ResetPassword';
import ShiftSchedulePlanner from './components/ShiftSchedulePlanner';
import ShiftPatternConfigurator from './components/ShiftPatternConfigurator';
import ShiftDashboard from './components/ShiftDashboard';
import ShiftManager from './components/ShiftManager';
import Dashboard from './Dashboard.jsx';
import RoleManagement from './components/RoleManagement';
import CostDashboard from './components/CostDashboard';
import SalesMappingManager from './components/SalesMappingManager';
import SalesUpload from './SalesUpload';
import SalesUploadsPage from './SalesUploadsPage';
import SalesUploadDetail from './SalesUploadDetail';
import SalesDashboard from './SalesDashboard';
import CloseoutPage from './CloseoutPage';
import { api } from './utils/auth';
import { API_URL, DEPLOY_TIME } from './config';

// Page keys available for role permissions
const AVAILABLE_PAGES = [
  'dashboard', 'menu', 'prices', 'inventory', 'users', 'shifts', 'shift_patterns', 'shift_manager', 'tasks', 'items', 'ingredients', 'receiving', 'inventory_scanner', 'roles', 'sales'
];

const DEFAULT_PERMISSIONS = {
  Admin: AVAILABLE_PAGES.reduce((acc, p) => ({ ...acc, [p]: true }), {}),
  Manager: {
    dashboard: true,
    menu: true,
    prices: true,
    inventory: true,
    users: false,
    shifts: true,
    shift_patterns: false,
    shift_manager: true,
    tasks: true,
    items: true,
    ingredients: true,
    receiving: true,
    inventory_scanner: false,
    roles: false,
    sales: true
  },
  Employee: {
    dashboard: true,
    menu: true,
    prices: false,
    inventory: false,
    users: false,
    shifts: true,
    shift_patterns: false,
    shift_manager: false,
    tasks: false,
    items: true,
    ingredients: true,
    receiving: false,
    inventory_scanner: false,
    roles: false,
    sales: false
  }
};

function readPermissions() {
  try {
    const raw = localStorage.getItem('rolePermissions');
    if (!raw) return DEFAULT_PERMISSIONS;
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read rolePermissions, falling back to defaults', e);
    return DEFAULT_PERMISSIONS;
  }
}

function hasAccess(user, pageKey) {
  if (!pageKey) return true; // default allow
  if (!user) return true; // if user not loaded but token exists, allow until check completes
  const role = user.role || 'Employee';
  const perms = readPermissions();
  // Admins always have full access as a safety fallback
  if (role === 'Admin') return true;
  const roleMap = perms[role] || DEFAULT_PERMISSIONS[role] || {};
  return !!roleMap[pageKey];
}

function pageKeyFromPath(path) {
  if (!path) return 'dashboard';
  if (path.startsWith('/menu') || path.startsWith('/item') || path.startsWith('/ingredients')) return 'menu';
  if (path.startsWith('/prices')) return 'prices';
  if (path.startsWith('/inventory')) return 'inventory';
  if (path.startsWith('/users')) return 'users';
  if (path.startsWith('/shifts/patterns')) return 'shift_patterns';
  if (path.startsWith('/shifts/manager')) return 'shift_manager';
  if (path.startsWith('/shifts')) return 'shifts';
  if (path.startsWith('/tasks')) return 'tasks';
  if (path.startsWith('/roles')) return 'roles';
  if (path.startsWith('/receiving')) return 'receiving';
  if (path.startsWith('/inventory-scanner')) return 'inventory_scanner';
  if (path.startsWith('/closeout')) return 'sales';
  return 'dashboard';
}

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

          {/* Top-level links rendered only if current user role has access */}
          {hasAccess(user, 'menu') && (
            <Link to="/menu" className="text-sm font-semibold text-gray-700 hover:text-black">Menu</Link>
          )}
          {hasAccess(user, 'prices') && (
            <Link to="/prices" className="text-sm font-semibold text-gray-700 hover:text-black">Prices</Link>
          )}
          {hasAccess(user, 'inventory') && (
            <Link to="/inventory" className="text-sm font-semibold text-gray-700 hover:text-black">Inventory</Link>
          )}
          {hasAccess(user, 'users') && (
            <Link to="/users" className="text-sm font-semibold text-gray-700 hover:text-black">Users</Link>
          )}
          {hasAccess(user, 'shifts') && (
            <Link to="/shifts" className="text-sm font-semibold text-gray-700 hover:text-black">Shifts</Link>
          )}
          {hasAccess(user, 'tasks') && (
            <Link to="/tasks" className="text-sm font-semibold text-gray-700 hover:text-black">Tasks</Link>
          )}
          {hasAccess(user, 'sales') && (
            <Link to="/sales" className="text-sm font-semibold text-gray-700 hover:text-black">Sales</Link>
          )}
          {hasAccess(user, 'sales') && (
            <Link to="/closeout" className="text-sm font-semibold text-gray-700 hover:text-black">Closeout</Link>
          )}
          {hasAccess(user, 'roles') && (
            <Link to="/roles" className="text-sm font-semibold text-gray-700 hover:text-black">Role Management</Link>
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

function PrivateRoute({ children, user }) {
  const token = localStorage.getItem('token');
  const location = useLocation();
  if (!token) return <Navigate to="/login" state={{ from: location.pathname }} />;
  // If user not yet loaded, allow; auth check in App will load user
  if (!user) return children;
  const page = pageKeyFromPath(location.pathname);
  if (!hasAccess(user, page)) return <div className="p-6">You do not have permission to view this page.</div>;
  return children;
}

function App() {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    api.get('/api/auth/check')
      .then((res) => {
        const data = res.data;
        if (data?.status === 'valid') {
          setUser(data.user);
        } else {
          handleLogout();
        }
      })
      .catch((err) => {
        console.error('Auth check error:', err);
        handleLogout();
      });
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
        <Route path="/" element={<PrivateRoute user={user}><Dashboard /></PrivateRoute>} />

        {/* Main nav structure routes */}
        <Route path="/menu" element={<PrivateRoute user={user}><ItemsLanding /></PrivateRoute>} />
        <Route path="/ingredients" element={<PrivateRoute user={user}><IngredientsPage /></PrivateRoute>} />
        <Route path="/prices" element={<PrivateRoute user={user}><Prices /></PrivateRoute>} />
        <Route path="/inventory" element={<PrivateRoute user={user}><InventoryDashboard /></PrivateRoute>} />
        <Route path="/inventory/manual" element={<PrivateRoute user={user}><ManualInventoryPage /></PrivateRoute>} />
        <Route path="/users" element={<PrivateRoute user={user}><UserManagement /></PrivateRoute>} />
        <Route path="/roles" element={<PrivateRoute user={user}><RoleManagement /></PrivateRoute>} />
        <Route path="/shifts" element={<PrivateRoute user={user}><ShiftDashboard /></PrivateRoute>} />
        <Route path="/shifts/patterns" element={<PrivateRoute user={user}><ShiftPatternConfigurator /></PrivateRoute>} />
        <Route path="/shifts/manager" element={<PrivateRoute user={user}><ShiftManager /></PrivateRoute>} />
        <Route path="/tasks" element={<PrivateRoute user={user}><TasksPage user={user} /></PrivateRoute>} />
        <Route path="/costs" element={<PrivateRoute user={user}><CostDashboard /></PrivateRoute>} />

        {/* Other routes */}
        <Route path="/item/:id" element={<PrivateRoute user={user}><ItemDetail /></PrivateRoute>} />
        <Route path="/item/:id/edit" element={<PrivateRoute user={user}><EditItem /></PrivateRoute>} />
        <Route path="/item/new" element={<PrivateRoute user={user}><NewItemPage /></PrivateRoute>} />
        <Route path="/ingredients/:id" element={<PrivateRoute user={user}><IngredientDetail /></PrivateRoute>} />
        <Route path="/ingredients/:id/edit" element={<PrivateRoute user={user}><EditIngredient /></PrivateRoute>} />
        <Route path="/prices/new" element={<PrivateRoute user={user}><NewPriceQuoteForm /></PrivateRoute>} />
        <Route path="/inventory-scanner" element={<PrivateRoute user={user}><InventoryScanner /></PrivateRoute>} />
        <Route path="/receiving/new" element={<PrivateRoute user={user}><NewReceivingForm /></PrivateRoute>} />
        <Route path="/sales" element={<PrivateRoute user={user}><SalesDashboard /></PrivateRoute>} />
        <Route path="/sales/upload" element={<PrivateRoute user={user}><SalesUpload /></PrivateRoute>} />
        <Route path="/sales/uploads" element={<PrivateRoute user={user}><SalesUploadsPage /></PrivateRoute>} />
        <Route path="/sales/:id" element={<PrivateRoute user={user}><SalesUploadDetail /></PrivateRoute>} />
        <Route path="/mappings/sales" element={<PrivateRoute user={user}><SalesMappingManager /></PrivateRoute>} />
        <Route path="/closeout" element={<PrivateRoute user={user}><CloseoutPage /></PrivateRoute>} />
        <Route path="/closeout/:date" element={<PrivateRoute user={user}><CloseoutPage /></PrivateRoute>} />
      </Routes>

      {/* Footer with last deployment timestamp */}
      <footer className="bg-white border-t mt-6 py-4">
        <div className="max-w-6xl mx-auto px-6 text-sm text-gray-600 flex justify-between items-center">
          <div>
            <span>Jaybird Connect</span>
          </div>
          <div>
            <span>Last deployment: </span>
            <time dateTime={DEPLOY_TIME}>{new Date(DEPLOY_TIME).toLocaleString()}</time>
          </div>
        </div>
      </footer>
    </Router>
  );
}

export default App;

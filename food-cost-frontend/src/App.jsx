import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  Navigate
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
import { API_URL } from './config';

function Header({ user, onLogout }) {
  return (
    <header className="bg-white shadow-md py-4 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Link to="/">
          <img src={Logo} alt="Jaybird Connect logo" className="h-10" />
        </Link>
        
        {user?.role === 'Admin' ? (
          <>
            <Link to="/" className="text-sm font-semibold text-gray-700 hover:text-black">Items</Link>
            <Link to="/ingredients" className="text-sm font-semibold text-gray-700 hover:text-black">Ingredients</Link>
            <Link to="/prices" className="text-sm font-semibold text-gray-700 hover:text-black">Prices</Link>
            <Link to="/inventory" className="text-sm font-semibold text-gray-700 hover:text-black">Inventory</Link>
            {user?.role === 'Admin' && (
              <Link to="/users" className="text-sm font-semibold text-gray-700 hover:text-black">User Management</Link>
            )}
          </>
        ) : user ? (
          <Link to="/tasks" className="text-sm font-semibold text-gray-700 hover:text-black">My Tasks</Link>
        ) : null}
      </div>
      {user && (
        <div className="flex items-center space-x-4">
          <span className="font-medium text-gray-600">{user.name}</span>
          <button onClick={onLogout} className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded transition">Logout</button>
        </div>
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
          <Routes><Route path="/login" element={<Login setUser={setUser} />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Temporary dashboard redirect until we build the dashboard */}
        <Route path="/dashboard" element={<PrivateRoute><Navigate to="/" replace /></PrivateRoute>} />
        <Route path="/" element={<PrivateRoute><ItemsLanding /></PrivateRoute>} />
        <Route path="/item/:id" element={<PrivateRoute><ItemDetail /></PrivateRoute>} />
        <Route path="/item/:id/edit" element={<PrivateRoute><EditItem /></PrivateRoute>} />
        <Route path="/item/new" element={<PrivateRoute><NewItemPage /></PrivateRoute>} />
        <Route path="/ingredients" element={<PrivateRoute><IngredientsPage /></PrivateRoute>} />
        <Route path="/ingredients/:id" element={<PrivateRoute><IngredientDetail /></PrivateRoute>} />
        <Route path="/ingredients/:id/edit" element={<PrivateRoute><EditIngredient /></PrivateRoute>} />
        <Route path="/prices" element={<PrivateRoute><Prices /></PrivateRoute>} />
        <Route path="/prices/new" element={<PrivateRoute><NewPriceQuoteForm /></PrivateRoute>} />
        <Route path="/inventory" element={<PrivateRoute><InventoryDashboard /></PrivateRoute>} />
        <Route path="/inventory-scanner" element={<PrivateRoute><InventoryScanner /></PrivateRoute>} />
        <Route path="/receiving/new" element={<PrivateRoute><NewReceivingForm /></PrivateRoute>} />
        <Route path="/tasks" element={<PrivateRoute><TasksPage user={user} /></PrivateRoute>} />
        {user?.role === 'Admin' && (
          <Route path="/users" element={<PrivateRoute><UserManagement /></PrivateRoute>} />
              )}
          </Routes>
        </Router>
  );
}

export default App;


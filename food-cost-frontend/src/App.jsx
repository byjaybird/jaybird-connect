import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  useParams
} from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
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
import { API_URL, GOOGLE_CLIENT_ID } from './config';

function Header({ user, onLogout }) {
  return (
    <header className="bg-white shadow-md py-4 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Link to="/">
          <img src={Logo} alt="Jaybird Connect logo" className="h-10" />
        </Link>
        
        {/* Show different navigation based on user role */}
        {user.role === 'admin' ? (
          <>
            <Link to="/" className="text-sm font-semibold text-gray-700 hover:text-black">
              Items
            </Link>
            <Link to="/ingredients" className="text-sm font-semibold text-gray-700 hover:text-black">
              Ingredients
            </Link>
            <Link to="/prices" className="text-sm font-semibold text-gray-700 hover:text-black">
              Prices
            </Link>
            <Link to="/inventory" className="text-sm font-semibold text-gray-700 hover:text-black">
              Inventory
            </Link>
            {user && user.role === 'Admin' && (
              <Link 
                to="/users" 
                className="text-gray-300 hover:bg-gray-700 hover:text-white px-3 py-2 rounded-md text-sm font-medium"
              >
                User Management
              </Link>
            )}
          </>
        ) : (
          <Link to="/tasks" className="text-sm font-semibold text-gray-700 hover:text-black">
            My Tasks
          </Link>
        )}
      </div>
      {user && (
        <div className="flex items-center space-x-4">
          <span className="font-medium text-gray-600">{user.name}</span>
          <button
            onClick={onLogout}
            className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded transition"
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
}

function ItemList() {
  const [itemsByCategory, setItemsByCategory] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    fetch(`${API_URL}/items`)
      .then((res) => res.json())
      .then((data) => {
        const visibleItems = data.filter((item) => !!item.is_for_sale);
        const grouped = visibleItems.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        setItemsByCategory(grouped);
      });
  }, []);

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-6">Menu Items</h1>
      {Object.entries(itemsByCategory).map(([category, items]) => (
        <div key={category} className="mb-4 border rounded shadow-sm">
          <button
            onClick={() => toggleCategory(category)}
            className="w-full flex justify-between items-center bg-gray-100 p-4 text-left font-semibold text-lg"
          >
            <span>{category}</span>
            <span>{expandedCategories[category] ? '▲' : '▼'}</span>
          </button>
          {expandedCategories[category] && (
            <ul className="p-4 bg-white border-t space-y-2">
              {items.map((item) => (
                <li key={item.item_id} className="hover:text-blue-600">
                  <div className="flex justify-between items-center">
                    <Link
                      to={`/item/${item.item_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <Link
                      to={`/item/${item.item_id}/edit`}
                      className="text-sm text-gray-500 hover:text-black ml-4"
                    >
                      ✏️ Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function AuthGate({ children, setAppUser }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));
  const [loginError, setLoginError] = useState(null);

  const handleLoginSuccess = async (credentialResponse) => {
    try {
      const decoded = jwtDecode(credentialResponse.credential);
      
      const response = await fetch(`${API_URL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: decoded.email,
          name: decoded.name,
          googleId: decoded.sub
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Authentication failed');
      }

      const userData = await response.json();
      
      // Store auth info
      const authToken = `${decoded.sub}|${decoded.email}`;
      localStorage.setItem('authToken', authToken);
      localStorage.setItem('user', JSON.stringify(userData));
      
      setLoginError(null);
      setUser(userData);
      setAppUser(userData);
    } catch (error) {
      console.error('Authentication failed:', error);
      setLoginError(
        'Access denied. Your email address is not registered with this application. Please contact your administrator to request access.'
      );
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl mb-4">Welcome to Jaybird Connect</h1>
        <p className="text-gray-600 mb-6 text-center max-w-md">
          Please sign in with your registered Google account.
        </p>
        {loginError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 max-w-md text-center">
            {loginError}
          </div>
        )}
        <GoogleLogin
          onSuccess={handleLoginSuccess}
          onError={() => {
            console.error('Login Failed');
            setLoginError('Login failed. Please try again or contact your administrator.');
          }}
        />
        <p className="text-sm text-gray-500 mt-4 text-center max-w-md">
          Access is restricted to pre-registered users only. If you need access, please contact your administrator to have your email address added to the system.
        </p>
      </div>
    );
  }

  return children;
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/'; // Forces reload to login screen
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthGate setAppUser={setUser}>
        <Router>
          <Header user={user} onLogout={handleLogout} />
          <Routes>
            <Route path="/" element={<ItemsLanding />} />
            <Route path="/item/:id" element={<ItemDetail />} />
            <Route path="/item/:id/edit" element={<EditItem />} />
            <Route path="/item/new" element={<NewItemPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/ingredients/:id" element={<IngredientDetail />} />
            <Route path="/ingredients/:id/edit" element={<EditIngredient />} />
            <Route path="/prices" element={<Prices />} />
            <Route path="/prices/new" element={<NewPriceQuoteForm />} />
            <Route path="/inventory" element={<InventoryDashboard />} />
            <Route path="/inventory-scanner" element={<InventoryScanner />} />
            <Route path="/receiving/new" element={<NewReceivingForm />} />
            <Route path="/tasks" element={<TasksPage user={user} />} />
             {user && user.role === 'Admin' && (
                <Route path="/users" element={<UserManagement />} />
              )}
          </Routes>
        </Router>
      </AuthGate>
    </GoogleOAuthProvider>
  );
}

export default App;
